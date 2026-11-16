// QA for the one remaining mockup route, POST /api/mockups/nanobanana (Gemini). There is no other mockup route and no fallback.
//   m3  the caller comes from the database (blocked / demoted users lose access at once), draft must belong to the build
//   m8  guests are refused; per-user and store-wide daily caps (start the server with --env AI_MOCKUP_DAILY_LIMIT_PER_USER=3 --env AI_MOCKUP_DAILY_LIMIT_GLOBAL=5)
//   gone  the old Print Mockup route no longer exists
// Usage (each part needs a FRESH isolated server started with --fake-prisma --qa-routes):
//   node scripts/isolation/qa/mockup-access.mjs m3 | m8 | gone
// WHAT THIS PROVES: the application's access decisions, against the in-memory fake database. Nothing here talks to Gemini or Paymob.
import { IDS, QA_ADMIN, TEST_USER } from "../fake-prisma/seed.mjs";
const base = "http://localhost:3100";
const part = process.argv[2];
const ok = (name, cond, detail = "") => { console.log(cond ? "  PASS" : "  FAIL", name, cond ? "" : `\n         ${detail}`); if (!cond) process.exitCode = 1; };
const makeSession = () => {
  const jar = new Map();
  const store = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); jar.set(k, v.join("=")); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  return {
    async login(email, password) {
      let r = await fetch(`${base}/api/auth/csrf`); store(r); const { csrfToken } = await r.json();
      r = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password, json: "true" }) }); store(r);
    },
    async get(path) { const res = await fetch(base + path, { headers: jar.size ? { cookie: cookie() } : {} }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: res.status, json, text }; },
    async post(path, body) { const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(jar.size ? { cookie: cookie() } : {}) }, body: JSON.stringify(body) }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: res.status, json, text }; },
  };
};
const AI = "/api/mockups/nanobanana";
const layerFor = (assetId) => [{ placement: "CENTER_FRONT", assetId, x: 0, y: 0, scale: 1, rotation: 0 }];
const draftIdOf = async (buildId) => (await (await fetch(`${base}/api/qa-sim/draft-id`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ buildId }) })).json()).draftId;
const body = (buildId, draftId, assetId) => ({ buildId, draftId, product: "FITTED", color: "BLACK", layers: layerFor(assetId) });
const setState = (b) => fetch(`${base}/api/qa-sim/set-user-state`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
const makeAdmin = () => fetch(`${base}/api/qa-sim/make-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: QA_ADMIN.email, password: QA_ADMIN.password }) });
// "access passed" = the request got PAST the authorization checks (it may still fail later: Gemini is not configured here)
const denied = (r) => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 429;

if (part === "m3") {
  console.log("-- M3: the caller is decided from the database, not from the session token");
  const mine = body(IDS.savedBuild, await draftIdOf(IDS.savedBuild), IDS.savedAsset);
  const theirs = body(IDS.otherBuild, await draftIdOf(IDS.otherBuild), IDS.otherAsset);
  const user = makeSession(); await user.login(TEST_USER.email, TEST_USER.password);
  ok("setup: throwaway admin created (fake database only)", (await makeAdmin()).status === 200);
  const admin = makeSession(); await admin.login(QA_ADMIN.email, QA_ADMIN.password);

  const own = await user.post(AI, mine);
  ok("an active owner passes the access checks on their own build", !denied(own), `${own.status} ${own.text.slice(0, 160)}`);
  const foreign = await user.post(AI, theirs);
  ok("an ordinary user is refused on someone else's build (403)", foreign.status === 403, `${foreign.status} ${foreign.text.slice(0, 160)}`);
  const adm = await admin.post(AI, theirs);
  ok("an ACTIVE admin passes on any build", !denied(adm), `${adm.status} ${adm.text.slice(0, 160)}`);

  const healthAsAdmin = await admin.get("/api/health/ready");
  ok("an active admin sees the detailed environment report on /api/health/ready", Array.isArray(healthAsAdmin.json?.checks?.env?.missing), healthAsAdmin.text.slice(0, 200));

  console.log("   admin DEMOTED in the database; their session token still says ADMIN");
  await setState({ email: QA_ADMIN.email, role: "USER" });
  const healthDemoted = await admin.get("/api/health/ready");
  ok("the demoted admin no longer sees the detailed environment report (only ok / not ok)", healthDemoted.json?.checks?.env && !("missing" in healthDemoted.json.checks.env), healthDemoted.text.slice(0, 200));
  const demoted = await admin.post(AI, theirs);
  ok("the demoted admin is refused on someone else's build at once (403): the stale token claim is ignored", demoted.status === 403, `${demoted.status} ${demoted.text.slice(0, 160)}`);

  console.log("   owner BLOCKED in the database; their session token is still valid");
  await setState({ email: TEST_USER.email, blocked: true });
  const blocked = await user.post(AI, mine);
  ok("a blocked user is refused even on their own build (401: a blocked account counts as signed out)", blocked.status === 401, `${blocked.status} ${blocked.text.slice(0, 160)}`);
  await setState({ email: TEST_USER.email, blocked: false });
  const back = await user.post(AI, mine);
  ok("unblocked again: access returns", !denied(back), `${back.status} ${back.text.slice(0, 160)}`);

  console.log("   the draft must belong to the build");
  const crossDraft = await user.post(AI, body(IDS.savedBuild, theirs.draftId, IDS.savedAsset));
  ok("naming ANOTHER user's draft with your own build is refused (404) and does not touch that draft", crossDraft.status === 404, `${crossDraft.status} ${crossDraft.text.slice(0, 160)}`);
  const garbage = await user.post(AI, body(IDS.savedBuild, "no-such-draft", IDS.savedAsset));
  ok("an unknown draft id is refused (404)", garbage.status === 404, `${garbage.status}`);
}

if (part === "m8") {
  console.log("-- M8: Gemini is for signed-in users only, with daily caps");
  const draftId = await draftIdOf(IDS.savedBuild);
  const mine = body(IDS.savedBuild, draftId, IDS.savedAsset);
  const guest = makeSession();
  const g = await guest.post(AI, mine);
  ok("a guest is refused with 401 and told to sign in (backend check, not just a hidden button)", g.status === 401 && /sign in/i.test(g.json?.error ?? ""), `${g.status} ${g.text.slice(0, 200)}`);
  ok("the refusal message does not mention any print preview", !/print/i.test(g.text));
  const guestDirect = await fetch(base + AI, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  ok("a guest posting an empty body gets 401 too (the sign-in check comes before everything else)", guestDirect.status === 401);

  const user = makeSession(); await user.login(TEST_USER.email, TEST_USER.password);
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await user.post(AI, mine));
  ok("a signed-in owner passes the sign-in gate (the first 3 requests reach the generator step; it is unconfigured here)", results.slice(0, 3).every((r) => r.status !== 401 && r.status !== 403 && r.status !== 429), JSON.stringify(results.map((r) => r.status)));
  ok("the 4th request in a day hits the per-user cap: 429 with the 'today's limit' message", results[3].status === 429 && /today's limit/i.test(results[3].json?.error ?? ""), `${results[3].status} ${results[3].text.slice(0, 200)}`);

  ok("setup: throwaway admin created (fake database only)", (await makeAdmin()).status === 200);
  const admin = makeSession(); await admin.login(QA_ADMIN.email, QA_ADMIN.password);
  const theirs = body(IDS.otherBuild, await draftIdOf(IDS.otherBuild), IDS.otherAsset);
  const a1 = await admin.post(AI, theirs);
  const a2 = await admin.post(AI, theirs);
  const a3 = await admin.post(AI, theirs);
  ok("store-wide cap: the user's 3 + the admin's 2 use the budget of 5", a1.status !== 503 && a2.status !== 503, `${a1.status} ${a2.status}`);
  ok("the next request, from anyone, gets 503 'temporarily unavailable'", a3.status === 503 && /temporarily unavailable/i.test(a3.json?.error ?? ""), `${a3.status} ${a3.text.slice(0, 200)}`);
}

if (part === "gone") {
  console.log("-- the Print Mockup route no longer exists");
  const user = makeSession(); await user.login(TEST_USER.email, TEST_USER.password);
  const guest = makeSession();
  const mine = body(IDS.savedBuild, await draftIdOf(IDS.savedBuild), IDS.savedAsset);
  for (const [who, s] of [["a guest", guest], ["a signed-in user", user]]) {
    const r = await s.post("/api/mockups/print", mine);
    ok(`${who}: POST /api/mockups/print is 404 (it is gone, not just protected)`, r.status === 404, `${r.status} ${r.text.slice(0, 120)}`);
  }
  const get = await fetch(`${base}/api/mockups/print`);
  ok("GET /api/mockups/print is 404 too", get.status === 404, String(get.status));
}
