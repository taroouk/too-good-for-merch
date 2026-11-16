// QA for M4: POST /api/auth/register does not reveal whether an address already has an account.
// Usage (each mode needs a FRESH isolated server started with --fake-prisma --qa-routes; registration is rate limited to 5 per 10 minutes per IP):
//   node scripts/isolation/qa/auth-register.mjs [race | rate]      (no argument = the response-equality checks)
// WHAT THIS PROVES: the application's responses against the in-memory fake database. Timing is reported, not asserted (too noisy).
import { TEST_USER } from "../fake-prisma/seed.mjs";
const base = "http://localhost:3100";
const ok = (name, cond, detail = "") => { console.log(cond ? "  PASS" : "  FAIL", name, cond ? "" : `\n         ${detail}`); if (!cond) process.exitCode = 1; };
const register = async (email, password) => { const t = performance.now(); const res = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }); const text = await res.text(); return { status: res.status, text, ms: Math.round(performance.now() - t) }; };
const loginWorks = async (email, password) => {
  const jar = new Map(); const store = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); jar.set(k, v.join("=")); } };
  const ck = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  let r = await fetch(`${base}/api/auth/csrf`); store(r); const { csrfToken } = await r.json();
  r = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: ck() }, body: new URLSearchParams({ csrfToken, email, password, json: "true" }) }); store(r);
  const s = await (await fetch(`${base}/api/auth/session`, { headers: { cookie: ck() } })).json();
  return Boolean(s?.user?.id);
};

const mode = process.argv[2] ?? "equality";
if (mode === "equality") {
console.log("-- M4: a new address and an existing one look the same");
const fresh = "newperson@tgfm.test";
const a = await register(fresh, "a-strong-password-1");
const b = await register(fresh, "a-different-password-2");           // same address again (now existing)
const c = await register(TEST_USER.email, "attacker-chosen-password"); // a seeded, existing account
ok("new address: 201 with a plain { ok: true }", a.status === 201 && a.text === JSON.stringify({ ok: true }), `${a.status} ${a.text}`);
ok("the same address again: the IDENTICAL status and body (no 409, no 'already in use')", b.status === a.status && b.text === a.text, `${b.status} ${b.text}`);
ok("an existing seeded account: the IDENTICAL status and body", c.status === a.status && c.text === a.text, `${c.status} ${c.text}`);
ok("no response contains an id, role, email or the words 'already' / 'in use'", ![a, b, c].some((r) => /"id"|role|@|already|in use|exists/i.test(r.text)), JSON.stringify([a.text, b.text, c.text]));
console.log(`   (timing, not asserted: new ${a.ms} ms, repeat ${b.ms} ms, existing ${c.ms} ms)`);
ok("the new account really exists: its owner can sign in with the ORIGINAL password", await loginWorks(fresh, "a-strong-password-1"));
ok("re-registering did NOT change that account's password (the second password does not work)", !(await loginWorks(fresh, "a-different-password-2")));
ok("registering over a seeded account did NOT change its password (the attacker's password does not work, the original still does)", !(await loginWorks(TEST_USER.email, "attacker-chosen-password")) && (await loginWorks(TEST_USER.email, TEST_USER.password)));
const badEmail = await register("not-an-email", "a-strong-password-1");
const shortPw = await register("short@tgfm.test", "short");
ok("validation is unchanged: an invalid email is 400 and a short password is 400", badEmail.status === 400 && shortPw.status === 400, `${badEmail.status} ${shortPw.status}`);
}

if (mode === "race") {
  console.log("-- M4: five simultaneous registrations of the SAME new address");
  const email = "race@tgfm.test";
  const results = await Promise.all([1, 2, 3, 4, 5].map((i) => register(email, `race-password-${i}-xxxxx`)));
  ok("all five get the identical 201 { ok: true } (no 500, no 409 for the losers)", results.every((r) => r.status === 201 && r.text === JSON.stringify({ ok: true })), JSON.stringify(results.map((r) => [r.status, r.text])));
  let winners = 0;
  for (let i = 1; i <= 5; i++) if (await loginWorks(email, `race-password-${i}-xxxxx`)) winners++;
  ok("exactly ONE account was created: exactly one of the five passwords works", winners === 1, `working passwords: ${winners}`);
}

if (mode === "rate") {
  console.log("-- M4: registration is rate limited (5 per 10 minutes per IP) and the limited reply reveals nothing");
  const out = [];
  for (let i = 0; i < 7; i++) out.push(await register(`rate${i}@tgfm.test`, "a-strong-password-1"));
  ok("the first 5 are accepted", out.slice(0, 5).every((r) => r.status === 201), JSON.stringify(out.map((r) => r.status)));
  ok("the 6th and 7th are 429", out[5].status === 429 && out[6].status === 429, JSON.stringify(out.map((r) => r.status)));
  const limitedExisting = await register(TEST_USER.email, "x-strong-password-1");
  ok("a limited request for an EXISTING address looks exactly like a limited request for a new one", limitedExisting.status === 429 && limitedExisting.text === out[5].text, `${limitedExisting.text} vs ${out[5].text}`);
}
