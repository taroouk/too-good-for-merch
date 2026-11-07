// Manual QA script for the payment path. Run against a server started with:
//   node scripts/isolation/run-isolated.mjs --fake-prisma --os-sandbox --port 3100 -- node node_modules/next/dist/bin/next dev --turbopack -H 127.0.0.1 -p 3100
// Everything is local: Paymob is not configured in the isolated environment, so no provider call is ever attempted.
import { IDS, TEST_USER } from "../fake-prisma/seed.mjs";
const base = "http://localhost:3100"; const jar = new Map();
const store = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); jar.set(k, v.join("=")); } };
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
let r = await fetch(`${base}/api/auth/csrf`); store(r); const { csrfToken } = await r.json();
r = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken, email: TEST_USER.email, password: TEST_USER.password, json: "true" }) }); store(r);
const me = cookie();
const customer = { name: "Test Customer", email: TEST_USER.email, phone: "+201000000000" };
const shippingAddress = { country: "EG", line1: "1 Test Street", line2: "", city: "Cairo", region: "", postalCode: "" };
const call = async (label, body, cookieHeader = me) => {
  const res = await fetch(`${base}/api/payments/paymob/create-intent`, { method: "POST", headers: { "content-type": "application/json", ...(cookieHeader ? { cookie: cookieHeader } : {}) }, body: JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  console.log(label.padEnd(60), res.status, res.headers.get("x-checkout-code") ?? "", text.slice(0, 170));
  return { status: res.status, json };
};
const ordersPage = async () => { const t = await (await fetch(`${base}/orders`, { headers: { cookie: me } })).text(); return [...t.matchAll(/Order<\/[^>]+>\s*<[^>]+>\s*([A-Z0-9-]+)/g)].length || (t.match(/TGFM-[A-Z0-9-]+/g) ?? []).length; };
const good = { acceptTerms: true, method: "CARD", customer, shippingAddress };
// The total the checkout page would be showing for the saved build (a new order is only created for exactly this amount).
const savedTotal = (await (await fetch(`${base}/api/build/${IDS.savedBuild}`, { headers: { cookie: me } })).json()).totals.totalPaymentCents;
const expect = (name, ok) => { console.log(ok ? "  PASS" : "  FAIL", name); if (!ok) process.exitCode = 1; };

console.log("-- request validation");
expect("no session -> 401", (await call("anonymous", { ...good, buildId: IDS.savedBuild }, null)).status === 401);
expect("terms not accepted -> 400", (await call("acceptTerms=false", { ...good, acceptTerms: false, buildId: IDS.savedBuild })).status === 400);
expect("bad method -> 400", (await call("method=BITCOIN", { ...good, method: "BITCOIN", buildId: IDS.savedBuild })).status === 400);
console.log("-- reuse / in-flight / paid / ownership (seeded orders)");
const reuse = await call("pending order with a live link", { ...good, orderId: IDS.orderReuse, buildId: IDS.savedBuild });
expect("reuse returns the SAME link, 200", reuse.status === 200 && reuse.json?.paymentUrl === "https://payments.example.invalid/pay/2001");
expect("in-flight order -> 409 PAYMENT_ALREADY_IN_PROGRESS", (await call("order with a CREATED attempt", { ...good, orderId: IDS.orderInFlight, buildId: IDS.savedBuild })).json?.code === "PAYMENT_ALREADY_IN_PROGRESS");
const paid = await call("already paid order", { ...good, orderId: IDS.orderPaid, buildId: IDS.savedBuild });
expect("paid order -> 409", paid.status === 409);
const other = await call("ANOTHER user's order id", { ...good, orderId: IDS.orderOther, buildId: IDS.otherBuild });
expect("other user's order -> 404, no data", other.status === 404 && !/TGFM-3001|other@/.test(JSON.stringify(other.json)));
expect("unknown order id -> 404", (await call("unknown order id", { ...good, orderId: "nope", buildId: IDS.savedBuild })).status === 404);
console.log("-- new order from a build (Paymob not configured -> clean failure)");
const before = await ordersPage();
const first = await call("checkout #1 (new order)", { ...good, buildId: IDS.savedBuild, size: "M", expectedTotalCents: savedTotal });
const afterFirst = await ordersPage();
expect("a failed payment start is a friendly 5xx with an orderId and no technical text", first.status >= 500 && typeof first.json?.orderId === "string" && !/Paymob|PAYMOB|env|stack|fake-prisma/i.test(first.json?.error ?? ""));
expect("exactly one new order was created", afterFirst === before + 1);
const second = await call("checkout #2 (same build again)", { ...good, buildId: IDS.savedBuild, size: "M", expectedTotalCents: savedTotal });
expect("resubmitting the same design reuses the order (no duplicate)", (await ordersPage()) === afterFirst && second.json?.orderId === first.json?.orderId);
const retry = await call("retry by orderId", { ...good, orderId: first.json?.orderId, buildId: IDS.savedBuild, size: "M", expectedTotalCents: savedTotal });
expect("retry by orderId keeps the same order", (await ordersPage()) === afterFirst && retry.json?.orderId === first.json?.orderId);
const clean = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " | ").replace(/(\s*\|\s*)+/g, " | ");
const page = clean(await (await fetch(`${base}/orders/${first.json?.orderId}`, { headers: { cookie: me } })).text());
console.log("  order page excerpt:", page.slice(page.indexOf("Payment failed"), page.indexOf("Payment failed") + 120));
expect("order page says Payment failed with a retry action", /Payment failed/.test(page) && /Try card payment again/.test(page));
expect("order page shows EGP whole pounds and no dollars", /EGP \d+(,\d{3})*(?!\.)/.test(page) && !/\$|USD/.test(page));
const foreign = await fetch(`${base}/orders/${IDS.orderOther}`, { headers: { cookie: me }, redirect: "manual" });
expect("another user's order page is not shown", foreign.status !== 200 || !/TGFM-3001/.test(await foreign.text()));
