// Password reset end to end against REAL PostgreSQL (needs the VerificationToken table, which the fake database does not have).
// Usage: TEST_DATABASE_URL=<local test db> QA_SERVER_LOG=<server log file> node scripts/isolation/qa/password-reset.mjs
// The isolated dev server prints the reset link to its log instead of e-mailing it (no mail provider exists), which is how the token is read.
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { TEST_USER } from "../fake-prisma/seed.mjs";
const base = "http://localhost:3100";
const log = process.env.QA_SERVER_LOG; const dbUrl = process.env.TEST_DATABASE_URL;
if (!log || !dbUrl) { console.error("BLOCKED: set QA_SERVER_LOG and TEST_DATABASE_URL"); process.exit(3); }
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(dbUrl)) { console.error("REFUSED: TEST_DATABASE_URL is not local"); process.exit(2); }
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const ok = (name, cond, detail = "") => { console.log(cond ? "  PASS" : "  FAIL", name, cond ? "" : `\n         ${detail}`); if (!cond) process.exitCode = 1; };
const post = async (path, body) => { const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: res.status, json: j, text: t }; };
const canLogin = async (email, password) => {
  const jar = new Map(); const st = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); jar.set(k, v.join("=")); } };
  const ck = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  let r = await fetch(`${base}/api/auth/csrf`); st(r); const { csrfToken } = await r.json();
  r = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: ck() }, body: new URLSearchParams({ csrfToken, email, password, json: "true" }) }); st(r);
  return Boolean((await (await fetch(`${base}/api/auth/session`, { headers: { cookie: ck() } })).json())?.user?.id);
};
const linkFor = async (email) => { // the newest dev link printed for this address
  for (let i = 0; i < 20; i++) { const text = fs.readFileSync(log, "utf8"); const re = new RegExp(`reset-password\\?token=([^&\\s]+)&email=${encodeURIComponent(email).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"); let m, last = null; while ((m = re.exec(text))) last = decodeURIComponent(m[1]); if (last) return last; await new Promise((r) => setTimeout(r, 250)); }
  return null;
};
// Every run uses its own, never-before-used addresses (the reset limits are per address and live in the server process), so the script can
// be run again against the same server and still prove the same things: the account is created here, not taken from the seed.
// The per-ADDRESS limits can never collide (every run uses fresh addresses), but the per-IP ones do (forgot: 10 requests / 15 min, reset:
// 10 / 15 min, sign-in: per IP too -- and every run comes from the same IP): a second run inside 15 minutes was refused by them with 429.
// The counters live in the disposable test database, so reset the "auth:" buckets (and nothing else) at the start. The local-database
// check above guarantees this never touches a real database.
await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "auth:" } } });
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const email = `pr-${run}@tgfm.test`;
const made = await post("/api/qa-sim/make-user", { email, password: TEST_USER.password });
if (made.status !== 200) { console.error("BLOCKED: could not create the run's account (is the server started with --qa-routes?)", made.status, made.text); process.exit(3); }

console.log("-- password reset on real PostgreSQL");
const before = await prisma.verificationToken.count();
const unknown = await post("/api/auth/forgot-password", { email: `nobody-${run}@tgfm.test` });
ok("forgot-password for an unknown address: 200 and NO token row is created", unknown.status === 200 && (await prisma.verificationToken.count()) === before, `${unknown.status} rows ${before}->${await prisma.verificationToken.count()}`);
const known = await post("/api/auth/forgot-password", { email });
ok("forgot-password for a known address: the same 200 { ok: true } body", known.status === 200 && JSON.stringify(known.json) === JSON.stringify(unknown.json), `${known.text} vs ${unknown.text}`);
ok("exactly one token row was stored for the account, and it is HASHED (the raw token is not in the database)", (await prisma.verificationToken.count({ where: { identifier: { contains: email } } })) === 1);
const token = await linkFor(email);
ok("the reset link was produced (dev log)", Boolean(token));
const row = await prisma.verificationToken.findFirst({ where: { identifier: { contains: email } } });
ok("the stored token differs from the raw token in the link (hash only)", row && row.token !== token && !String(row.token).includes(token), JSON.stringify(row)?.slice(0, 120));
ok("the token expires in the future (within a few hours)", row && row.expires.getTime() > Date.now() && row.expires.getTime() < Date.now() + 24 * 3600_000);

const second = await post("/api/auth/forgot-password", { email });
const token2 = await linkFor(email);
ok("a new request invalidates the older link (one live link per account)", second.status === 200 && token2 && token2 !== token && (await prisma.verificationToken.count({ where: { identifier: { contains: email } } })) === 1);
const stale = await post("/api/auth/reset-password", { email, token, password: "brand-new-password-1" });
ok("the OLDER link no longer works (400)", stale.status === 400, `${stale.status} ${stale.text}`);
ok("a wrong e-mail with a valid token is refused (400)", (await post("/api/auth/reset-password", { email: `someone-else-${run}@tgfm.test`, token: token2, password: "brand-new-password-1" })).status === 400);
ok("a too-short new password is refused (400) and does not burn the token", (await post("/api/auth/reset-password", { email, token: token2, password: "short" })).status === 400 && (await prisma.verificationToken.count({ where: { identifier: { contains: email } } })) === 1);

const results = await Promise.all([1, 2, 3, 4].map((i) => post("/api/auth/reset-password", { email, token: token2, password: `brand-new-password-${i}` })));
ok("four simultaneous submissions of the SAME valid token: exactly one succeeds", results.filter((r) => r.status === 200).length === 1 && results.filter((r) => r.status === 400).length === 3, JSON.stringify(results.map((r) => r.status)));
const winner = results.findIndex((r) => r.status === 200) + 1;
ok("the winner's password works and the OLD password no longer does", (await canLogin(email, `brand-new-password-${winner}`)) && !(await canLogin(email, TEST_USER.password)));
ok("the losers' passwords do not work", (await Promise.all([1, 2, 3, 4].filter((i) => i !== winner).map((i) => canLogin(email, `brand-new-password-${i}`)))).every((x) => !x));
ok("the token cannot be used a second time (400) and its row is gone", (await post("/api/auth/reset-password", { email, token: token2, password: "yet-another-password-1" })).status === 400 && (await prisma.verificationToken.count({ where: { identifier: { contains: email } } })) === 0);

console.log("-- expiry and blocked accounts");
await post("/api/auth/forgot-password", { email });
const token3 = await linkFor(email);
await prisma.verificationToken.updateMany({ where: { identifier: { contains: email } }, data: { expires: new Date(Date.now() - 1000) } });
ok("an EXPIRED token is refused (400)", (await post("/api/auth/reset-password", { email, token: token3, password: "expired-token-password-1" })).status === 400);
await prisma.user.update({ where: { email }, data: { blockedAt: new Date() } });
const blockedReq = await post("/api/auth/forgot-password", { email });
ok("a BLOCKED account gets the same 200 answer", blockedReq.status === 200, blockedReq.text);
const countBlocked = await prisma.verificationToken.count({ where: { identifier: { contains: email } } });
ok("...no live token exists for the blocked account", countBlocked === 0 || (await prisma.verificationToken.findMany({ where: { identifier: { contains: email } } })).every((t) => t.expires < new Date()), String(countBlocked));
await prisma.user.update({ where: { email }, data: { blockedAt: null } });

console.log("-- rate limits");
const many = []; for (let i = 0; i < 4; i++) many.push((await post("/api/auth/forgot-password", { email: `rate-${run}@tgfm.test` })).status);
ok("forgot-password is limited per address: all answers stay an identical 200 (no signal about the limit)", many.every((s) => s === 200), JSON.stringify(many));
await prisma.$disconnect();
