// QA for the audit fixes. The checkout endpoint is rate limited (12 requests / 10 min per user), so the checks run
// in three parts, each against a FRESH isolated server:  node scripts/isolation/qa/audit-fixes.mjs 1|2|3
//   node scripts/isolation/run-isolated.mjs --fake-prisma --qa-routes --os-sandbox --port 3100 -- node node_modules/next/dist/bin/next dev --turbopack -H 127.0.0.1 -p 3100
// Everything runs against the in-memory fake database; Paymob is not configured (no provider call can happen).
// The fake proves THIS APPLICATION'S logic only. It says nothing about PostgreSQL row locks or about Paymob.
import { IDS, TEST_USER } from "../fake-prisma/seed.mjs";
const base = "http://localhost:3100"; const jar = new Map();
const store = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); jar.set(k, v.join("=")); } };
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
let r = await fetch(`${base}/api/auth/csrf`); store(r); const { csrfToken } = await r.json();
r = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken, email: TEST_USER.email, password: TEST_USER.password, json: "true" }) }); store(r);
const me = cookie();
const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: me } }); return { status: res.status, json: await res.json().catch(() => null) }; };
const post = async (p, body) => { const res = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json", cookie: me }, body: JSON.stringify(body) }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: res.status, json, text }; };
const intent = (body) => post("/api/payments/paymob/create-intent", body);
const html = (s) => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " | ").replace(/&#x27;/g, "'").replace(/(\s*\|\s*)+/g, " | ");
const ordersText = async () => html(await (await fetch(`${base}/orders`, { headers: { cookie: me } })).text());
const orderCount = async () => new Set((await ordersText()).match(/TGFM-[A-Z0-9]{4,}(-[A-Z0-9]+)?/g) ?? []).size;
const ok = (name, cond, detail = "") => { console.log(cond ? "  PASS" : "  FAIL", name, cond ? "" : `\n         ${detail}`); if (!cond) process.exitCode = 1; };
const customer = { name: "Test Customer", email: TEST_USER.email, phone: "+201000000000" };
const shippingAddress = { country: "EG", line1: "1 Test Street", line2: "", city: "Cairo", region: "", postalCode: "" };
const base0 = { acceptTerms: true, method: "CARD", customer, shippingAddress };
const part = process.argv[2] ?? "all"; const want = (n) => part === "all" || part === String(n);
const quoteTotal = async (buildId) => (await get(`/api/build/${buildId}`)).json.totals.totalPaymentCents;

if (want(1)) {
console.log("-- 2. placements: the server prices the SAVED design, whatever the request says");
const pq = async (placements) => (await post("/api/pricing/quote", { product: "OVERSIZED", fabric: "SIGNATURE_200", quantity: 1, placements })).json?.total;
const withBoth = await pq(["CENTER_FRONT", "RIGHT_CHEST"]); const frontOnly = await pq(["CENTER_FRONT"]);
ok("sanity: the extra placement really costs more (fixture rule)", withBoth > frontOnly, `${withBoth} vs ${frontOnly}`);
const multiTotal = await quoteTotal(IDS.multiBuild);
const rate = 50; // fake store rate
ok("checkout quote of the two-placement design = both placements priced", multiTotal === Math.round((withBoth * 100 * rate) / 100) * 100, `${multiTotal} vs ${withBoth}`);
const tamperedQuote = (await get(`/api/build/${IDS.multiBuild}?placements=CENTER_FRONT`)).json.totals.totalPaymentCents;
ok("a ?placements= query string cannot lower the displayed quote", tamperedQuote === multiTotal);
const before = await orderCount();
const cheaper = await intent({ ...base0, buildId: IDS.multiBuild, size: "M", placements: ["CENTER_FRONT"], expectedTotalCents: multiTotal - 10000 });
ok("a request that claims fewer placements AND a lower total is refused (409 PRICE_CHANGED), nothing created", cheaper.status === 409 && cheaper.json?.code === "PRICE_CHANGED" && cheaper.json?.currentTotalCents === multiTotal && (await orderCount()) === before, cheaper.text.slice(0, 160));
const forged = await intent({ ...base0, buildId: IDS.multiBuild, size: "M", placements: [], expectedTotalCents: multiTotal });
ok("a forged `placements` field is ignored: the order is created at the full price", forged.status === 502 && typeof forged.json?.orderId === "string", forged.text.slice(0, 160));
const forgedPage = html(await (await fetch(`${base}/orders/${forged.json?.orderId}`, { headers: { cookie: me } })).text());
ok("the stored order total is the full server price", forgedPage.includes(`EGP ${(multiTotal / 100).toLocaleString("en-US")}`), forgedPage.slice(forgedPage.indexOf("Order summary"), forgedPage.indexOf("Order summary") + 160));

console.log("-- 3. the approved total");
const noTotal = await intent({ ...base0, buildId: IDS.savedBuild, size: "M" });
ok("no expectedTotalCents -> 400 TOTAL_CONFIRMATION_REQUIRED, no order", noTotal.status === 400 && noTotal.json?.code === "TOTAL_CONFIRMATION_REQUIRED");
const savedTotal = await quoteTotal(IDS.savedBuild);
const n0 = await orderCount();
const stale = await intent({ ...base0, buildId: IDS.savedBuild, size: "M", expectedTotalCents: savedTotal + 100 });
ok("a total that is not the current one -> 409 PRICE_CHANGED with the current total, no order", stale.status === 409 && stale.json?.code === "PRICE_CHANGED" && stale.json?.currentTotalCents === savedTotal && stale.json?.approvedTotalCents === savedTotal + 100 && (await orderCount()) === n0, stale.text.slice(0, 200));
const bagTotal = (await get("/api/bag/quote")).json.totals.totalPaymentCents;
const cartStale = await intent({ ...base0, cart: true, expectedTotalCents: bagTotal - 100 });
ok("same for the bag: stale total -> 409 PRICE_CHANGED, no order", cartStale.status === 409 && cartStale.json?.currentTotalCents === bagTotal && (await orderCount()) === n0);
const cartNo = await intent({ ...base0, cart: true });
ok("the bag without a total -> 400, no order", cartNo.status === 400 && (await orderCount()) === n0);
console.log("   (a bag that really changes between display and submit is checked in the browser, see the report)");

console.log("-- 1. one rounding model: Buy Now = bag for the same item, with fees at zero and non-zero");
const sameItem = async (label) => {
  const totals = (await get(`/api/build/${IDS.savedBuild}`)).json.totals;
  const bagLine = (await get("/api/bag/quote")).json.items.find((i) => i.buildId === IDS.savedBuild).linePaymentCents;
  // what the Studio shows: /api/pricing/quote for the design's product/fabric/quantity/placements, converted to whole pounds
  const studioUsd = (await post("/api/pricing/quote", { product: "FITTED", fabric: "SIGNATURE_200", quantity: 1, placements: ["CENTER_FRONT"] })).json.total;
  const studioEgp = Math.round((studioUsd * 100 * totals.exchangeRate) / 100) * 100;
  ok(`${label}: Buy Now subtotal = bag line = Studio price`, totals.subtotalPaymentCents === bagLine && bagLine === studioEgp, `${totals.subtotalPaymentCents} / ${bagLine} / ${studioEgp}`);
  ok(`${label}: total = subtotal + fees`, totals.totalPaymentCents - totals.subtotalPaymentCents === Math.round(((totals.taxUsdCents + totals.shippingUsdCents) * totals.exchangeRate) / 100) * 100);
};
await sameItem("fees zero");
await post("/api/qa-sim/set-store", { taxRateBps: 1400, shippingCents: 500, usdToEgpRate: 47.3 });
const fb = (await get(`/api/build/${IDS.savedBuild}`)).json.totals; const bagFee = (await get("/api/bag/quote")).json;
const bagSaved = bagFee.items.find((i) => i.buildId === IDS.savedBuild).linePaymentCents;
ok("fees non-zero: the item's subtotal is the same on both paths", fb.subtotalPaymentCents === bagSaved, `${fb.subtotalPaymentCents} vs ${bagSaved}`);
ok("fees non-zero: tax + shipping converted together, total = subtotal + fees", fb.totalPaymentCents === fb.subtotalPaymentCents + Math.round(((fb.taxUsdCents + fb.shippingUsdCents) * 47.3) / 100) * 100, JSON.stringify(fb));
const t1 = await intent({ ...base0, buildId: IDS.savedBuild, size: "M", expectedTotalCents: fb.totalPaymentCents });
ok("Buy Now creates its order at exactly that total (fees included)", t1.status === 502 && typeof t1.json?.orderId === "string", t1.text.slice(0, 140));
await post("/api/qa-sim/set-store", { taxRateBps: 0, shippingCents: 0, usdToEgpRate: 50 });
const afterRate = await intent({ ...base0, buildId: IDS.savedBuild, size: "M", expectedTotalCents: fb.totalPaymentCents });
ok("when the rate/tax/shipping changed after the total was shown, the old total is refused (PRICE_CHANGED)", afterRate.status === 409 && afterRate.json?.code === "PRICE_CHANGED", afterRate.text.slice(0, 160));

console.log("-- 4. currency (the fake StoreSetting.currency is USD, the schema default; payments must not depend on it)");
const retryEgp = await intent({ ...base0, orderId: IDS.orderReuse });
ok("an EGP order is retried/reused although StoreSetting.currency says USD", retryEgp.status === 200 && retryEgp.json?.paymentUrl, retryEgp.text.slice(0, 160));
const stale1 = await intent({ ...base0, orderId: IDS.orderStaleCurrency });
ok("an order created in another currency is refused as outdated (409)", stale1.status === 409 && /outdated/i.test(stale1.text), stale1.text.slice(0, 160));
const fresh = await intent({ ...base0, buildId: IDS.dupBuild, size: "M", expectedTotalCents: await quoteTotal(IDS.dupBuild) });
const freshRetry = await intent({ ...base0, orderId: fresh.json?.orderId });
ok("a brand-new order can be retried by orderId (no permanent 409)", fresh.status === 502 && freshRetry.status === 502 && freshRetry.json?.code === "PAYMENT_INITIALIZATION_FAILED", `${fresh.status} ${freshRetry.status} ${freshRetry.text.slice(0, 120)}`);

}
if (want(2)) {
console.log("-- 5. payable states");
const multiTotal = await quoteTotal(IDS.multiBuild);
const forged = await intent({ ...base0, buildId: IDS.multiBuild, size: "M", expectedTotalCents: multiTotal });
ok("setup: an order that failed to start payment exists", forged.status === 502 && forged.json?.orderId, forged.text.slice(0, 120));
const refuse = async (label, orderId, code) => { const x = await intent({ ...base0, orderId }); ok(`${label} -> 409 ${code}`, x.status === 409 && x.json?.code === code, x.text.slice(0, 160)); };
await refuse("cancelled (still UNPAID)", IDS.orderCancelled, "ORDER_CANCELLED");
await refuse("refunded", IDS.orderRefunded, "ORDER_REFUNDED");
await refuse("paid", IDS.orderPaid, "ORDER_ALREADY_PAID");
await refuse("unpaid but already in production", IDS.orderInProduction, "ORDER_NOT_PAYABLE");
const failedRetry = await intent({ ...base0, orderId: forged.json?.orderId });
ok("a FAILED order can be retried (not refused)", failedRetry.status === 502 && failedRetry.json?.code === "PAYMENT_INITIALIZATION_FAILED", failedRetry.text.slice(0, 140));
console.log("-- 5b. an admin-cancelled order is never reused by a new checkout");
const buyA = await intent({ ...base0, buildId: IDS.multiBuild, size: "M", expectedTotalCents: multiTotal });
ok("same design again reuses the open order", buyA.json?.orderId === forged.json?.orderId, `${buyA.json?.orderId} vs ${forged.json?.orderId}`);
await post("/api/qa-sim/set-order", { orderId: forged.json?.orderId, status: "CANCELLED" });
const buyB = await intent({ ...base0, buildId: IDS.multiBuild, size: "M", expectedTotalCents: multiTotal });
ok("after the admin cancels it, checkout creates a NEW order instead of reopening the cancelled one", buyB.status === 502 && buyB.json?.orderId && buyB.json.orderId !== forged.json?.orderId, buyB.text.slice(0, 160));
const reopen = await intent({ ...base0, orderId: forged.json?.orderId });
ok("and the cancelled order itself stays unpayable", reopen.status === 409 && reopen.json?.code === "ORDER_CANCELLED");

}
if (want(3)) {
console.log("-- 7. Buy Now and the bag for the same design");
const buyNow = await intent({ ...base0, buildId: IDS.savedBuild, size: "M", expectedTotalCents: await quoteTotal(IDS.savedBuild) });
const bag = await intent({ ...base0, cart: true, expectedTotalCents: (await get("/api/bag/quote")).json.totals.totalPaymentCents });
ok("two open orders exist for the saved design (Buy Now order, bag order)", buyNow.json?.orderId && bag.json?.orderId && buyNow.json.orderId !== bag.json.orderId, `${buyNow.text.slice(0, 80)} | ${bag.text.slice(0, 80)}`);
const paid = await post("/api/qa-sim/mark-paid", { orderId: bag.json?.orderId });
ok("the bag order is paid (simulated database effect)", paid.status === 200 && paid.json?.bagCount === 0, paid.text.slice(0, 100));
const second = await intent({ ...base0, orderId: buyNow.json?.orderId });
ok("starting a payment for the OTHER open order of that design is refused (409 ORDER_SUPERSEDED)", second.status === 409 && second.json?.code === "ORDER_SUPERSEDED" && /TGFM-/.test(second.json?.error ?? ""), second.text.slice(0, 200));
const supersededSeed = await intent({ ...base0, orderId: IDS.orderSuperseded });
ok("seeded case: unpaid order whose design was paid later on a bag order -> ORDER_SUPERSEDED", supersededSeed.status === 409 && supersededSeed.json?.code === "ORDER_SUPERSEDED", supersededSeed.text.slice(0, 160));
const reorder = await intent({ ...base0, orderId: IDS.orderReorder });
ok("a re-order created AFTER the design was paid is NOT blocked", reorder.status === 502 && reorder.json?.code === "PAYMENT_INITIALIZATION_FAILED", reorder.text.slice(0, 160));
const newBuy = await intent({ ...base0, buildId: IDS.savedBuild, size: "M", expectedTotalCents: await quoteTotal(IDS.savedBuild) });
ok("buying the same design again later (a new Buy Now) is allowed", newBuy.status === 502 && newBuy.json?.orderId && newBuy.json.orderId !== buyNow.json?.orderId, newBuy.text.slice(0, 160));

console.log("-- the order page's retry button (exactly what PaymentStatusClient.retry() sends)");
const pageRetry = await intent({ orderId: IDS.orderReuse, method: "CARD" });
ok("no stored consent on that order: the server asks for it (400 TERMS_NOT_ACCEPTED), it is not a contact-validation error", pageRetry.status === 400 && pageRetry.json?.code === "TERMS_NOT_ACCEPTED", pageRetry.text.slice(0, 160));
}
