// QA for "one checkout, one payment for the whole bag". Start the isolated server with the QA route enabled:
//   node scripts/isolation/run-isolated.mjs --fake-prisma --qa-routes --os-sandbox --port 3100 -- node node_modules/next/dist/bin/next dev --turbopack -H 127.0.0.1 -p 3100
// Paymob is not configured there, so every payment start fails cleanly and nothing leaves the machine. "Success" is
// simulated by /api/qa-sim/mark-paid (database effects only; it is NOT the Paymob webhook).
import { IDS, OTHER_USER, TEST_USER } from "../fake-prisma/seed.mjs";
const base = "http://localhost:3100"; const jar = new Map();
const store = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); jar.set(k, v.join("=")); } };
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
let r = await fetch(`${base}/api/auth/csrf`); store(r); const { csrfToken } = await r.json();
r = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken, email: TEST_USER.email, password: TEST_USER.password, json: "true" }) }); store(r);
const me = cookie();
const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: me } }); return { status: res.status, json: await res.json().catch(() => null) }; };
const post = async (p, body, c = me) => { const res = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...(c ? { cookie: c } : {}) }, body: JSON.stringify(body) }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: res.status, json, text }; };
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " | ").replace(/&#x27;/g, "'").replace(/(\s*\|\s*)+/g, " | ");
const ok = (name, cond, detail = "") => { console.log(cond ? "  PASS" : "  FAIL", name, cond ? "" : detail); if (!cond) process.exitCode = 1; };
const customer = { name: "Test Customer", email: TEST_USER.email, phone: "+201000000000" };
const shippingAddress = { country: "EG", line1: "1 Test Street", line2: "", city: "Cairo", region: "", postalCode: "" };
let cartBody = { cart: true, acceptTerms: true, method: "CARD", customer, shippingAddress };
const ordersCount = async () => (text(await (await fetch(`${base}/orders`, { headers: { cookie: me } })).text()).match(/TGFM-[A-Z0-9-]+/g) ?? []).length;

console.log("-- the bag and its single total");
const q = await get("/api/bag/quote");
ok("quote loads", q.status === 200 && q.json?.items?.length === 3, JSON.stringify(q.json).slice(0, 200));
const items = q.json.items; const totals = q.json.totals;
ok("three items with their own sizes and quantities", ["M", "L", "S"].every((s) => items.some((i) => i.size === s)) && items.some((i) => i.quantity === 2));
ok("lines are whole pounds in EGP and add up to the subtotal", items.every((i) => i.linePaymentCents % 100 === 0) && items.reduce((n, i) => n + i.linePaymentCents, 0) === totals.subtotalPaymentCents && totals.paymentCurrency === "EGP");
ok("total = subtotal + shipping/tax (none configured), one payment", totals.shippingUsdCents === 0 && totals.taxUsdCents === 0 && totals.totalPaymentCents === totals.subtotalPaymentCents);
let independent = 0;
for (const item of items) {
  const single = await get(`/api/build/${item.buildId}`);
  independent += single.json?.totals?.totalPaymentCents ?? NaN;
  ok(`line for ${item.buildId} equals that build's own standalone quote`, single.json?.totals?.totalPaymentCents === item.linePaymentCents, `${single.json?.totals?.totalPaymentCents} vs ${item.linePaymentCents}`);
}
ok("bag total equals the sum of the independent single-build quotes", independent === totals.totalPaymentCents);
console.log(`   total EGP ${totals.totalPaymentCents / 100}`);
cartBody = { ...cartBody, expectedTotalCents: totals.totalPaymentCents }; // the total the page shows and the customer approves
const bagPage = text(await (await fetch(`${base}/bag`, { headers: { cookie: me } })).text());
ok("bag page: one checkout for the whole bag, shows the same total", /One checkout for everything in your bag/.test(bagPage) && bagPage.includes(`EGP ${(totals.totalPaymentCents / 100).toLocaleString("en-US")}`));
ok("bag page: no per-item Checkout button (a single Checkout)", (bagPage.match(/\| Checkout \|/g) ?? []).length === 1);

console.log("-- payment start fails cleanly (Paymob not configured): one order, no duplicates, retry reuses it");
const before = await ordersCount();
const a = await post("/api/payments/paymob/create-intent", cartBody);
ok("first attempt: friendly 502 with an orderId", a.status === 502 && typeof a.json?.orderId === "string" && !/PAYMOB|stack|fake-prisma/i.test(a.json.error), a.text.slice(0, 160));
const orderId = a.json?.orderId;
ok("exactly one new order for the three items", (await ordersCount()) === before + 1);
const b = await post("/api/payments/paymob/create-intent", cartBody);
ok("submitting the same bag again reuses the order (no duplicate)", b.json?.orderId === orderId && (await ordersCount()) === before + 1);
const c2 = await post("/api/payments/paymob/create-intent", { ...cartBody, orderId });
ok("retry by orderId keeps the same order", c2.json?.orderId === orderId && (await ordersCount()) === before + 1);
const [d1, d2] = await Promise.all([post("/api/payments/paymob/create-intent", cartBody), post("/api/payments/paymob/create-intent", cartBody)]);
ok("two simultaneous submits still give one order", d1.json?.orderId === orderId && d2.json?.orderId === orderId && (await ordersCount()) === before + 1);
const detail = text(await (await fetch(`${base}/orders/${orderId}`, { headers: { cookie: me } })).text());
ok("order page: Items (3), Payment failed with retry, EGP only", /Items \(3\)/.test(detail) && /Payment failed/.test(detail) && /Try card payment again/.test(detail) && !/\$|USD/.test(detail));
ok("order page total equals the bag total", detail.includes(`EGP ${(totals.totalPaymentCents / 100).toLocaleString("en-US")}`), detail.slice(detail.indexOf("Order summary"), detail.indexOf("Order summary") + 200));
const list = text(await (await fetch(`${base}/orders`, { headers: { cookie: me } })).text());
ok("orders list shows the cart order as 3 items, not as its first item only", /\| Items \| 3 \|/.test(list));
const stillThere = await get("/api/bag/quote");
ok("a failed payment leaves the bag untouched", stillThere.json?.items?.length === 3);

console.log("-- a changed bag is a different order");
const other = await post("/api/payments/paymob/create-intent", { ...cartBody, orderId: "nope" });
ok("unknown order id -> 404", other.status === 404);

console.log("-- payment success (simulated database effect), then the bag is empty");
const paid = await post("/api/qa-sim/mark-paid", { orderId });
ok("order marked paid; every bag item of that order removed", paid.status === 200 && paid.json?.bagCount === 0, paid.text.slice(0, 120));
const after = text(await (await fetch(`${base}/orders/${orderId}`, { headers: { cookie: me } })).text());
ok("order page says Confirmed after payment", /Confirmed/.test(after) && /Payment received/.test(after));
const empty = await post("/api/payments/paymob/create-intent", cartBody);
ok("checking out an empty bag is refused with a clear message", empty.status >= 400 && /bag is empty/i.test(empty.text), empty.text.slice(0, 160));
const again = await post("/api/payments/paymob/create-intent", { ...cartBody, orderId });
ok("paying the already-paid order again is refused (409)", again.status === 409);
ok("the empty bag quote is refused", (await get("/api/bag/quote")).status === 400);
ok("another user's order id is invisible", (await post("/api/payments/paymob/create-intent", { ...cartBody, orderId: IDS.orderOther })).status === 404 && OTHER_USER.email !== TEST_USER.email);
