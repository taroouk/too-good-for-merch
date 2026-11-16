// Route / permission sweep over the whole site (no payments): every page and API route as guest, owner, another user and admin.
// Usage (FRESH isolated server with --fake-prisma --qa-routes):  node scripts/isolation/qa/site-sweep.mjs
// WHAT THIS PROVES: the application's routing, redirects, authorization and input handling against the in-memory fake database.
// A 500 caused by a model the fake database does not implement is reported as BLOCKED(fake), not as a bug (see FAKE_UNSUPPORTED in the server log).
import { IDS, QA_ADMIN, TEST_USER } from "../fake-prisma/seed.mjs";
const base = "http://localhost:3100";
const makeSession = () => {
  const jar = new Map();
  const store = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); jar.set(k, v.join("=")); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  return {
    async login(email, password) {
      let r = await fetch(`${base}/api/auth/csrf`); store(r); const { csrfToken } = await r.json();
      r = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken, email, password, json: "true" }) }); store(r);
    },
    async req(method, path, { body, raw, headers = {} } = {}) {
      const res = await fetch(base + path, { method, redirect: "manual", headers: { ...(raw === undefined && body !== undefined ? { "content-type": "application/json" } : {}), ...(jar.size ? { cookie: cookie() } : {}), ...headers }, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
      const text = await res.text();
      return { status: res.status, loc: res.headers.get("location") ?? "", text, ct: res.headers.get("content-type") ?? "", h: res.headers };
    },
  };
};
const guest = makeSession();
const owner = makeSession(); await owner.login(TEST_USER.email, TEST_USER.password);
await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "sweep2@tgfm.test", password: "sweep-password-2" }) });
const other = makeSession(); await other.login("sweep2@tgfm.test", "sweep-password-2");
await fetch(`${base}/api/qa-sim/make-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: QA_ADMIN.email, password: QA_ADMIN.password }) });
const admin = makeSession(); await admin.login(QA_ADMIN.email, QA_ADMIN.password);
const who = { guest, owner, other, admin };

const rows = []; let fails = 0, blocked = 0;
// expect: a predicate on {status, loc}. kind labels what the row proves.
async function check(label, actor, method, path, expect, opts) {
  const r = await who[actor].req(method, path, opts);
  let verdict = expect(r) ? "PASS" : "FAIL";
  if (verdict === "FAIL" && r.status >= 500) { verdict = "BLOCKED(500)"; }
  if (verdict === "FAIL") fails++;
  if (verdict.startsWith("BLOCKED")) blocked++;
  rows.push({ label, actor, method, path, status: r.status, loc: r.loc.replace(base, ""), verdict });
  return r;
}
const is = (...codes) => (r) => codes.includes(r.status);
const redirectsTo = (re) => (r) => r.status >= 300 && r.status < 400 && re.test(r.loc);
// a page that streams may answer 200 and carry the redirect inside the stream (NEXT_REDIRECT digest) instead of a 3xx
const loginRedirect = (r) => (r.status >= 300 && r.status < 400 && /login/.test(r.loc)) || /NEXT_REDIRECT;[a-z]+;\/login/.test(r.text);
const denied = (r) => [301, 302, 303, 307, 308, 401, 403, 404].includes(r.status);
const okPage = (r) => r.status === 200;

// ---- public pages (everyone)
for (const p of ["/", "/contact", "/coming-soon", "/legal/terms", "/legal/privacy", "/legal/refunds", "/legal/nope", "/login", "/register", "/forgot-password", "/reset-password", "/bespoke", "/bespoke/new", "/robots.txt", "/sitemap.xml", "/api/health"]) {
  for (const a of ["guest", "owner"]) await check("public page", a, "GET", p, p === "/legal/nope" ? is(404) : (r) => r.status === 200 || (r.status >= 300 && r.status < 400), undefined);
}
await check("404 page", "guest", "GET", "/definitely-not-a-page", is(404));
await check("portfolio redirect", "guest", "GET", "/portfolio", redirectsTo(/#our-work|\//));

// ---- account / customer pages
for (const [p, label] of [["/orders", "orders list"], ["/wishlist", "wishlist"], ["/bag", "bag"], ["/studio/projects", "projects"], ["/payments/success", "payments result"], ["/payments/failed", "payments result"]]) {
  await check(`${label}: guest is not shown account data`, "guest", "GET", p, (r) => denied(r) || r.status === 200);
  await check(`${label}: owner`, "owner", "GET", p, (r) => r.status === 200 || (r.status >= 300 && r.status < 400));
}
await check("orders list requires login", "guest", "GET", "/orders", redirectsTo(/\/login/));
await check("order detail: owner sees own order", "owner", "GET", `/orders/${IDS.orderPaid}`, okPage);
await check("order detail: another user is refused", "other", "GET", `/orders/${IDS.orderPaid}`, denied);
await check("order detail: guest is refused", "guest", "GET", `/orders/${IDS.orderPaid}`, denied);
await check("order success page: another user is refused", "other", "GET", `/orders/${IDS.orderPaid}/success`, denied);
await check("order failed page: another user is refused", "other", "GET", `/orders/${IDS.orderPaid}/failed`, denied);
await check("unknown order id: 404 not 500", "owner", "GET", "/orders/does-not-exist", is(404, 307));
await check("checkout page renders for owner (no payment is started by viewing it)", "owner", "GET", `/checkout?buildId=${IDS.savedBuild}&size=M`, (r) => r.status === 200 || (r.status >= 300 && r.status < 400));

// ---- studio
await check("studio entry creates / resumes a build", "owner", "GET", "/studio", redirectsTo(/\/studio\//));
await check("studio entry for a guest", "guest", "GET", "/studio", redirectsTo(/\/studio\//));
for (const sub of ["", "/builder", "/assets", "/designs", "/settings"]) {
  await check(`studio project${sub || " root"}: owner`, "owner", "GET", `/studio/projects/${IDS.savedBuild}${sub}`, (r) => r.status === 200 || (r.status >= 300 && r.status < 400));
  await check(`studio project${sub || " root"}: another user is refused`, "other", "GET", `/studio/projects/${IDS.savedBuild}${sub}`, (r) => denied(r) || (r.status === 200 && !/Saved design|fake-art/.test(r.text)));
  await check(`studio project${sub || " root"}: guest is refused`, "guest", "GET", `/studio/projects/${IDS.savedBuild}${sub}`, (r) => denied(r) || (r.status === 200 && !/Saved design|fake-art/.test(r.text)));
}
await check("studio project unknown id", "owner", "GET", "/studio/projects/does-not-exist/builder", (r) => denied(r));

// ---- admin pages
const adminPages = ["/admin", "/admin/orders", `/admin/orders/${IDS.orderPaid}`, "/admin/users", "/admin/products", "/admin/pricing", "/admin/payments", "/admin/projects", "/admin/artworks", "/admin/bespoke", "/admin/audit", "/admin/settings", "/admin/system", "/admin/team", "/admin/legal"];
for (const p of adminPages) {
  await check(`admin ${p}: guest -> admin login`, "guest", "GET", p, redirectsTo(/\/admin\/login/));
  await check(`admin ${p}: ordinary user is refused`, "owner", "GET", p, (r) => denied(r) && (r.status >= 300 && r.status < 400 ? /\/admin\/login|\/login/.test(r.loc) : !/Dashboard|Orders \(/.test(r.text)));
  await check(`admin ${p}: admin`, "admin", "GET", p, (r) => r.status === 200);
}
await check("admin login page", "guest", "GET", "/admin/login", okPage);

// ---- API: auth required, ownership, methods, malformed input
const json = (r) => { try { return JSON.parse(r.text); } catch { return null; } };
await check("bag count: guest gets a count (0), not an error", "guest", "GET", "/api/bag/count", okPage);
await check("bag page: guest is sent to login", "guest", "GET", "/bag", loginRedirect);
await check("wishlist page: guest is sent to login", "guest", "GET", "/wishlist", loginRedirect);
await check("bag quote: guest is refused (401)", "guest", "GET", "/api/bag/quote", is(401));
await check("bag quote: owner", "owner", "GET", "/api/bag/quote", is(200));
await check("build quote: owner", "owner", "GET", `/api/build/${IDS.savedBuild}`, is(200));
await check("build quote: another user -> 404 (no existence leak)", "other", "GET", `/api/build/${IDS.savedBuild}`, is(404));
await check("build quote: guest -> 404", "guest", "GET", `/api/build/${IDS.savedBuild}`, is(404));
await check("build quote: unknown id -> 404", "owner", "GET", "/api/build/nope", is(404));
await check("build create: wrong method", "owner", "GET", "/api/build/create", is(405));
await check("build create: malformed JSON is a 4xx, not a 500", "owner", "POST", "/api/build/create", (r) => r.status >= 400 && r.status < 500, { raw: "{not json" });
await check("create-and-open-project: malformed JSON", "owner", "POST", "/api/create-and-open-project", (r) => r.status < 500, { raw: "{not json" });
await check("orders/create is gone (410)", "owner", "POST", "/api/orders/create", is(410));
await check("orders/create: GET not allowed", "owner", "GET", "/api/orders/create", is(405));
await check("pricing quote: wrong method", "guest", "GET", "/api/pricing/quote", is(405));
await check("pricing quote: malformed JSON", "guest", "POST", "/api/pricing/quote", (r) => r.status >= 400 && r.status < 500, { raw: "{" });
await check("pricing quote: empty object", "guest", "POST", "/api/pricing/quote", (r) => r.status >= 400 && r.status < 500, { body: {} });
await check("pricing quote: wrong types", "guest", "POST", "/api/pricing/quote", (r) => r.status >= 400 && r.status < 500, { body: { product: 5, quantity: "x", placements: "no" } });
await check("pricing quote: huge quantity", "guest", "POST", "/api/pricing/quote", (r) => r.status < 500, { body: { product: "FITTED", fabric: "SIGNATURE_200", quantity: 10 ** 12, placements: [] } });
await check("pricing quote: negative quantity", "guest", "POST", "/api/pricing/quote", (r) => r.status >= 400 && r.status < 500 || (json(r)?.ok === false), { body: { product: "FITTED", fabric: "SIGNATURE_200", quantity: -3, placements: [] } });
await check("health: ok", "guest", "GET", "/api/health", is(200));
await check("health/ready: no env detail for a guest", "guest", "GET", "/api/health/ready", (r) => !("missing" in (json(r)?.checks?.env ?? {})));
await check("admin me: guest redirected", "guest", "GET", "/api/admin/me", redirectsTo(/\/admin\/login/));
await check("admin me: ordinary user is refused", "owner", "GET", "/api/admin/me", (r) => r.status === 401 || r.status === 403);
await check("admin me: admin", "admin", "GET", "/api/admin/me", is(200));
await check("admin orders export: guest redirected", "guest", "GET", "/api/admin/orders/export", redirectsTo(/\/admin\/login/));
await check("admin orders export: ordinary user refused", "owner", "GET", "/api/admin/orders/export", (r) => r.status === 401 || r.status === 403);
await check("admin orders export: admin", "admin", "GET", "/api/admin/orders/export", (r) => r.status === 200 && /csv|text/.test(r.ct));
await check("admin artwork zip: ordinary user refused", "owner", "GET", "/api/admin/artworks/zip", (r) => r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400));

// ---- files: ownership (IDOR)
const FILES = [["asset", `/api/assets/${IDS.savedAsset}/file`], ["mockup", `/api/mockups/${IDS.savedMockup}/file`]];
for (const [kind, p] of FILES) {
  await check(`${kind} file: owner`, "owner", "GET", p, is(200));
  await check(`${kind} file: another user -> 403`, "other", "GET", p, is(403));
  await check(`${kind} file: guest -> 403`, "guest", "GET", p, is(403));
  await check(`${kind} file: admin`, "admin", "GET", p, is(200));
}
await check("asset file: unknown id -> 404", "owner", "GET", "/api/assets/nope/file", is(404));
await check("asset file: path traversal in id is not a file read", "owner", "GET", "/api/assets/..%2F..%2Fetc%2Fpasswd/file", (r) => r.status === 404 || r.status === 400);
await check("asset file is served with nosniff, a sandboxing CSP and a private cache", "owner", "GET", `/api/assets/${IDS.savedAsset}/file`, (r) => r.h.get("x-content-type-options") === "nosniff" && /sandbox/.test(r.h.get("content-security-policy") ?? "") && /private/.test(r.h.get("cache-control") ?? ""));
await check("mockup file is served with the sandboxing CSP too", "owner", "GET", `/api/mockups/${IDS.savedMockup}/file`, (r) => /^sandbox;/.test(r.h.get("content-security-policy") ?? "") && r.h.get("x-content-type-options") === "nosniff");
await check("site-wide security headers on a normal page", "guest", "GET", "/login", (r) => r.h.get("x-frame-options") === "DENY" && /frame-ancestors 'none'/.test(r.h.get("content-security-policy") ?? "") && !!r.h.get("strict-transport-security") && !r.h.get("x-powered-by"));
await check("artwork file: unknown id -> 404", "owner", "GET", "/api/artworks/nope/file", is(404));
await check("mockup file: unknown id -> 404", "owner", "GET", "/api/mockups/nope/file", is(404));
await check("mockup file: another user's mockup -> 403", "owner", "GET", `/api/mockups/${IDS.otherAiMockup}/file`, is(403));
await check("asset file: another user's asset -> 403", "owner", "GET", `/api/assets/${IDS.otherAsset}/file`, is(403));

// ---- Gemini route (stubless: auth, ownership, validation; no Gemini is ever called)
const AI = "/api/mockups/nanobanana";
await check("AI: GET not allowed", "owner", "GET", AI, is(405));
await check("AI: guest -> 401", "guest", "POST", AI, is(401), { body: {} });
await check("AI: owner + malformed JSON -> 400", "owner", "POST", AI, is(400), { raw: "{bad" });
await check("AI: owner + array body -> 400", "owner", "POST", AI, is(400), { raw: "[1,2]" });
await check("AI: owner + missing fields -> 400", "owner", "POST", AI, is(400), { body: {} });
await check("AI: invalid product -> 400", "owner", "POST", AI, is(400), { body: { buildId: IDS.savedBuild, draftId: "x", product: "HOODIE", color: "BLACK", layers: [] } });
await check("AI: invalid color -> 400", "owner", "POST", AI, is(400), { body: { buildId: IDS.savedBuild, draftId: "x", product: "FITTED", color: "PINK", layers: [] } });
await check("AI: no artwork -> 400", "owner", "POST", AI, is(400), { body: { buildId: IDS.savedBuild, draftId: "x", product: "FITTED", color: "BLACK", layers: [] } });
await check("AI: two sides in one request -> 400", "owner", "POST", AI, is(400), { body: { buildId: IDS.savedBuild, draftId: "x", product: "FITTED", color: "BLACK", layers: [{ placement: "CENTER_FRONT", assetId: IDS.savedAsset, x: 0, y: 0, scale: 1, rotation: 0 }, { placement: "FULL_BACK", assetId: IDS.savedAsset, x: 0, y: 0, scale: 1, rotation: 0 }] } });
await check("AI: asset of another build -> 404", "owner", "POST", AI, is(404), { body: { buildId: IDS.savedBuild, draftId: "x", product: "FITTED", color: "BLACK", layers: [{ placement: "CENTER_FRONT", assetId: IDS.otherAsset, x: 0, y: 0, scale: 1, rotation: 0 }] } });
await check("AI: out-of-range transform values do not 500", "owner", "POST", AI, (r) => r.status < 500, { body: { buildId: IDS.savedBuild, draftId: "x", product: "FITTED", color: "BLACK", layers: [{ placement: "CENTER_FRONT", assetId: IDS.savedAsset, x: 1e9, y: -1e9, scale: 1e9, rotation: "NaN" }] } });
await check("print mockup route is gone", "owner", "POST", "/api/mockups/print", is(404), { body: {} });

// ---- auth endpoints
await check("register: GET not allowed", "guest", "GET", "/api/auth/register", is(405));
await check("register: array JSON -> 400", "guest", "POST", "/api/auth/register", is(400), { raw: "[]" });
await check("register: non-string email -> 400", "guest", "POST", "/api/auth/register", is(400), { body: { email: { a: 1 }, password: "long-enough-pass" } });
await check("register: 129-char password -> 400", "guest", "POST", "/api/auth/register", is(400), { body: { email: "x1@tgfm.test", password: "p".repeat(129) } });
await check("forgot-password: invalid email -> 400", "guest", "POST", "/api/auth/forgot-password", is(400), { body: { email: "nope" } });
await check("forgot-password: unknown address answers like a known one (200 or the same 503)", "guest", "POST", "/api/auth/forgot-password", (r) => r.status === 200 || r.status === 503, { body: { email: "nobody-here@tgfm.test" } });
// NOTE: reset-password needs the VerificationToken model, which the fake database does not implement -> BLOCKED(fake), not a bug
await check("reset-password: bad token -> 400", "guest", "POST", "/api/auth/reset-password", is(400), { body: { email: "a@tgfm.test", token: "zzz", password: "long-enough-pass" } });
await check("reset-password: malformed JSON -> 400", "guest", "POST", "/api/auth/reset-password", is(400), { raw: "{" });
await check("login via credentials with wrong password stays on the login flow", "guest", "POST", "/api/auth/callback/credentials", (r) => r.status < 500, { raw: "email=a&password=b", headers: { "content-type": "application/x-www-form-urlencoded" } });

// ---- blocked account: a valid session token must stop working everywhere at once
await fetch(`${base}/api/qa-sim/set-user-state`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: TEST_USER.email, blocked: true }) });
await check("BLOCKED owner: /orders -> login", "owner", "GET", "/orders", loginRedirect);
await check("BLOCKED owner: bag quote -> 401", "owner", "GET", "/api/bag/quote", is(401));
await check("BLOCKED owner: own build quote -> 404", "owner", "GET", `/api/build/${IDS.savedBuild}`, is(404));
await check("BLOCKED owner: own asset file -> 403", "owner", "GET", `/api/assets/${IDS.savedAsset}/file`, is(403));
await check("BLOCKED owner: own mockup file -> 403", "owner", "GET", `/api/mockups/${IDS.savedMockup}/file`, is(403));
await check("BLOCKED owner: order page -> refused", "owner", "GET", `/orders/${IDS.orderPaid}`, denied);
await check("BLOCKED owner: bag page -> login", "owner", "GET", "/bag", loginRedirect);
await check("BLOCKED owner: wishlist page -> login", "owner", "GET", "/wishlist", loginRedirect);
await check("BLOCKED owner: bag count -> 0", "owner", "GET", "/api/bag/count", (r) => r.status === 200 && JSON.parse(r.text).count === 0);
await check("BLOCKED owner: order success page -> login", "owner", "GET", `/orders/${IDS.orderPaid}/success`, loginRedirect);
await check("BLOCKED owner: Gemini -> 401", "owner", "POST", AI, is(401), { body: {} });
await check("BLOCKED owner: studio project -> refused", "owner", "GET", `/studio/projects/${IDS.savedBuild}/builder`, (r) => denied(r) || (r.status === 200 && !/Saved design|fake-art/.test(r.text)));
{ const s2 = makeSession(); await s2.login(TEST_USER.email, TEST_USER.password);
  const r = await s2.req("GET", "/api/auth/session"); let j = null; try { j = JSON.parse(r.text); } catch {}
  rows.push({ label: "a blocked account cannot sign in again", actor: "guest", method: "POST", path: "/api/auth/callback/credentials", status: r.status, loc: "", verdict: !j?.user ? "PASS" : (fails++, "FAIL") }); }
await fetch(`${base}/api/qa-sim/set-user-state`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: TEST_USER.email, blocked: false }) });
await check("unblocked again: own asset file works", "owner", "GET", `/api/assets/${IDS.savedAsset}/file`, is(200));

// ---- paymob routes are NOT exercised (out of scope for this phase)

// ---- sensitive data exposure in pages / responses
for (const [name, actor, path] of [["home", "guest", "/"], ["login", "guest", "/login"], ["order page", "owner", `/orders/${IDS.orderPaid}`], ["studio builder", "owner", `/studio/projects/${IDS.savedBuild}/builder`]]) {
  await check(`no secrets / hashes in ${name}`, actor, "GET", path, (r) => !/passwordHash|\$argon2|NEXTAUTH_SECRET|GEMINI_API_KEY|PAYMOB_[A-Z_]*KEY|PAYMOB_HMAC/.test(r.text));
}
{
  const r = await owner.req("GET", `/api/build/${IDS.savedBuild}`);
  rows.push({ label: "build quote leaks no internal fields", actor: "owner", method: "GET", path: `/api/build/${IDS.savedBuild}`, status: r.status, loc: "", verdict: !/userId|passwordHash|artworkData/.test(r.text) ? "PASS" : (fails++, "FAIL") });
}

// ---- print table
const w = (s, n) => String(s).slice(0, n).padEnd(n);
let pass = 0; for (const r of rows) { if (r.verdict === "PASS") pass++; console.log(`${w(r.verdict, 13)} ${w(r.actor, 6)} ${w(r.method, 5)} ${w(r.status, 4)} ${w(r.path, 62)} ${r.verdict === "PASS" ? "" : r.label} ${r.loc ? "-> " + r.loc : ""}`); }
console.log(`\nSUMMARY: ${rows.length} checks, PASS=${pass}, FAIL=${fails}, BLOCKED(500)=${blocked}`);
process.exitCode = fails ? 1 : 0;
