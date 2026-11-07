// QA for: stored terms consent on retry, one live payment per design, webhook handling of a design paid twice.
// Usage (each part needs a FRESH isolated server started with --qa-routes, because the checkout endpoint is rate limited):
//   node scripts/isolation/qa/double-payment.mjs terms | live | webhook-seq | webhook-rev | webhook-concurrent
// WHAT THIS PROVES: this application's decisions, against the in-memory fake database. WHAT IT DOES NOT PROVE: PostgreSQL row
// locks / isolation, or anything about Paymob. Webhook payloads are signed LOCALLY with a throwaway secret that only the
// isolated copy knows (PAYMOB_HMAC_SECRET set by --qa-routes); nothing is sent to Paymob and no Paymob key exists here.
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { IDS, QA_ADMIN, TEST_USER } from "../fake-prisma/seed.mjs";
const base = "http://localhost:3100"; const jar = new Map();
const store = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); jar.set(k, v.join("=")); } };
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
let r = await fetch(`${base}/api/auth/csrf`); store(r); const { csrfToken } = await r.json();
r = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken, email: TEST_USER.email, password: TEST_USER.password, json: "true" }) }); store(r);
const me = cookie();
const post = async (p, body, c = me) => { const res = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...(c ? { cookie: c } : {}) }, body: JSON.stringify(body) }); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: res.status, json, text }; };
const intent = (body) => post("/api/payments/paymob/create-intent", body);
const inspect = async (...ids) => Object.fromEntries((await post("/api/qa-sim/inspect", { orderIds: ids })).json.orders.map((o) => [o.id, o]));
const ok = (name, cond, detail = "") => { console.log(cond ? "  PASS" : "  FAIL", name, cond ? "" : `\n         ${detail}`); if (!cond) process.exitCode = 1; };
const customer = { name: "Test Customer", email: TEST_USER.email, phone: "+201000000000" };
const shippingAddress = { country: "EG", line1: "1 Test Street", line2: "", city: "Cairo", region: "", postalCode: "" };
const part = process.argv[2];
const page = async (path) => { const res = await fetch(base + path, { headers: { cookie: me }, redirect: "manual" }); const raw = await res.text(); return { status: res.status, raw, text: raw.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " | ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/(\s*\|\s*)+/g, " | ") }; };
const card = async (orderNumber) => { const raw = (await page("/orders")).raw; const articles = raw.match(/<article[\s\S]*?<\/article>/g) ?? []; const hit = articles.find((a) => a.includes(orderNumber)); return hit ? hit.replace(/<[^>]+>/g, " | ").replace(/&#x27;/g, "'").replace(/(\s*\|\s*)+/g, " | ") : ""; };

// ---- signed webhook (the documented Accept transaction callback shape, HMAC-SHA512 over the documented field order)
const KEYS = ["amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success"];
const nested = (o, path) => path.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : ""), o);
const secret = "qa-local-hmac-secret-not-a-real-key";
let txCounter = 880000;
const webhook = async (orderNumber, { amountCents = 49500, success = true, validSignature = true, currency = "EGP" } = {}) => {
  const id = ++txCounter;
  const obj = { id, amount_cents: amountCents, currency, success, pending: false, error_occured: false, has_parent_transaction: false, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, integration_id: 1, owner: 1, created_at: "2026-11-09T10:00:00.000000", order: { id: id * 10, merchant_order_id: orderNumber }, source_data: { pan: "2346", sub_type: "MasterCard", type: "card" } };
  const hmac = createHmac("sha512", secret).update(KEYS.map((k) => String(nested(obj, k) ?? "")).join("")).digest("hex");
  const res = await fetch(`${base}/api/payments/paymob/webhook?hmac=${validSignature ? hmac : "0".repeat(128)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "TRANSACTION", obj }) });
  return { status: res.status, json: await res.json().catch(() => null), transactionId: id };
};

if (part === "terms") {
  console.log("-- 3. retry and terms consent (consent stored on the order: time + revision)");
  const CURRENT = "terms:default-v1|refunds:default-v1";
  const retry = (orderId, extra = {}) => intent({ orderId, method: "CARD", ...extra }); // exactly what the order page sends
  const a = await retry(IDS.orderConsentOk);
  ok("stored consent for the current revision: retry without a new tick passes the consent check (then fails cleanly at the unconfigured provider)", a.status === 502 && a.json?.code === "PAYMENT_INITIALIZATION_FAILED", a.text.slice(0, 160));
  const old = await retry(IDS.orderConsentOld);
  ok("stored consent for an OLD revision: 400 TERMS_NOT_ACCEPTED with termsChanged=true, no payment started", old.status === 400 && old.json?.code === "TERMS_NOT_ACCEPTED" && old.json?.termsChanged === true && (await inspect(IDS.orderConsentOld))[IDS.orderConsentOld].attempts.length === 0, old.text.slice(0, 160));
  const none = await retry(IDS.orderConsentNone);
  ok("no stored consent: 400 TERMS_NOT_ACCEPTED (termsChanged=false), no payment started", none.status === 400 && none.json?.code === "TERMS_NOT_ACCEPTED" && none.json?.termsChanged === false, none.text.slice(0, 160));
  const bare = await intent({ orderId: IDS.orderConsentNone, method: "CARD", acceptTerms: false });
  ok("acceptTerms:false is not consent either", bare.status === 400 && bare.json?.code === "TERMS_NOT_ACCEPTED");
  const accepted = await retry(IDS.orderConsentOld, { acceptTerms: true });
  const after = (await inspect(IDS.orderConsentOld))[IDS.orderConsentOld];
  ok("consent given now is recorded with the CURRENT revision and a fresh time", accepted.status === 502 && after.termsVersion === CURRENT && Date.now() - new Date(after.termsAcceptedAt).getTime() < 60_000, JSON.stringify(after));
  const again = await retry(IDS.orderConsentOld);
  ok("and the next retry no longer asks", again.status === 502, again.text.slice(0, 120));
  const before = (await inspect(IDS.orderConsentOk))[IDS.orderConsentOk];
  const stillOk = await retry(IDS.orderConsentOk);
  const same = (await inspect(IDS.orderConsentOk))[IDS.orderConsentOk];
  ok("a retry that relies on stored consent does not overwrite it", stillOk.status === 502 && same.termsAcceptedAt === before.termsAcceptedAt && same.termsVersion === before.termsVersion, `${before.termsAcceptedAt} -> ${same.termsAcceptedAt}`);
  await post("/api/qa-sim/set-legal", { slug: "terms", body: "New terms text" });
  const changed = await retry(IDS.orderConsentOk);
  ok("the Terms page is edited: the same order now asks again (termsChanged=true)", changed.status === 400 && changed.json?.code === "TERMS_NOT_ACCEPTED" && changed.json?.termsChanged === true, changed.text.slice(0, 160));
  const reaccept = await retry(IDS.orderConsentOk, { acceptTerms: true });
  const v2 = (await inspect(IDS.orderConsentOk))[IDS.orderConsentOk];
  ok("after accepting the new revision the stored version is the new one", reaccept.status === 502 && v2.termsVersion !== CURRENT && /^terms:\d{4}-\d{2}-\d{2}T/.test(v2.termsVersion), v2.termsVersion);
  const quiet = await retry(IDS.orderConsentOk);
  ok("and retries pass again without a tick", quiet.status === 502, quiet.text.slice(0, 120));
  const fresh = await intent({ cart: true, method: "CARD", customer, shippingAddress, expectedTotalCents: 1 });
  ok("a NEW order always needs consent in the request (400 before anything else)", fresh.status === 400 && fresh.json?.code === "TERMS_NOT_ACCEPTED", fresh.text.slice(0, 120));
  const withNoContact = await retry(IDS.orderConsentOk, { customer: { name: "", email: "", phone: "" }, shippingAddress });
  ok("a retry that DOES send contact details still validates them", withNoContact.status === 400 && withNoContact.json?.code === "CHECKOUT_VALIDATION_FAILED", withNoContact.text.slice(0, 140));
}

if (part === "live") {
  console.log("-- 2. one live payment per design (create-intent decisions; Paymob unconfigured, no link is ever really created)");
  const start = (orderId) => intent({ orderId, method: "CARD", acceptTerms: true });
  const blocked = await start(IDS.orderLive2);
  ok("an order whose design already has a payment link opened 5 minutes ago cannot start a second payment (409 ORDER_COMPETING_PAYMENT)", blocked.status === 409 && blocked.json?.code === "ORDER_COMPETING_PAYMENT" && blocked.json?.existingOrderId === IDS.orderLive1, blocked.text.slice(0, 220));
  ok("the 409 explains it: another payment for this design is in progress, continue that order or wait for the link to expire, with the time left", /Another payment for this design is already in progress on order TGFM-5001/.test(blocked.json?.error ?? "") && /continue that order's payment, or wait until its payment link expires \(about 5\d more minutes?\)/.test(blocked.json?.error ?? "") && blocked.json?.minutesLeft >= 50 && blocked.json?.minutesLeft <= 56, blocked.text.slice(0, 300));
  ok("the 409 exposes no payment link, e-mail, address or amount, only the customer's own order id/number and the expiry time", !/paymentUrl|payments\.example|@|shipping|totalCents|customer/i.test(blocked.text) && Object.keys(blocked.json).sort().join() === ["code", "error", "existingOrderId", "existingOrderNumber", "linkExpiresAt", "minutesLeft", "orderId", "ok"].filter((k) => k in blocked.json).sort().join(), blocked.text.slice(0, 300));
  const own = await start(IDS.orderLive1);
  ok("the order that owns the live link keeps getting its own link back (not blocked by the other)", own.status === 200 && own.json?.paymentUrl === "https://payments.example.invalid/pay/5001", own.text.slice(0, 160));
  const expired = await start(IDS.orderExpired2);
  ok("the other link is 90 minutes old (a payment key lives at most an hour): the second order may start its own payment", expired.status === 502 && expired.json?.code === "PAYMENT_INITIALIZATION_FAILED", expired.text.slice(0, 160));
  const quoteExpired = (await (await fetch(`${base}/api/build/${IDS.expiredBuild}`, { headers: { cookie: me } })).json()).totals.totalPaymentCents;
  const rebuy = await intent({ ...{ acceptTerms: true, method: "CARD", customer, shippingAddress }, buildId: IDS.expiredBuild, size: "M", expectedTotalCents: quoteExpired });
  ok("buying the design again after the old link expired (and no payment ever succeeded) is allowed", rebuy.status === 502 && rebuy.json?.code === "PAYMENT_INITIALIZATION_FAILED", rebuy.text.slice(0, 160));
  const flight = await start(IDS.orderFlight2);
  ok("a payment being created right now (seconds old) blocks a second one too, with its own wording", flight.status === 409 && flight.json?.code === "ORDER_COMPETING_PAYMENT" && flight.json?.existingOrderId === IDS.orderFlight1 && /being started right now on order TGFM-5021/.test(flight.json?.error ?? ""), flight.text.slice(0, 200));
  const unaffected = await start(IDS.orderPaid);
  ok("unrelated states keep their own refusals (paid order -> ORDER_ALREADY_PAID)", unaffected.status === 409 && unaffected.json?.code === "ORDER_ALREADY_PAID");
  console.log("-- both pages open, then the first order is paid (webhook), then the second tries");
  const paid = await webhook("TGFM-5001");
  const state = await inspect(IDS.orderLive1);
  ok("webhook for the first order: PAID", paid.status === 200 && state[IDS.orderLive1].paymentStatus === "PAID", JSON.stringify(paid.json));
  const second = await start(IDS.orderLive2);
  ok("the second order can no longer start a payment (409 ORDER_SUPERSEDED)", second.status === 409 && second.json?.code === "ORDER_SUPERSEDED", second.text.slice(0, 200));
}

const duplicateFlag = (o) => o.audits.includes("PAYMOB_DUPLICATE_DESIGN_PAYMENT") && o.notes.some((n) => /duplicate payment/i.test(n));
if (part === "webhook-seq" || part === "webhook-rev") {
  const [first, second] = part === "webhook-seq" ? [["TGFM-5031", IDS.orderWebhook1], ["TGFM-5032", IDS.orderWebhook2]] : [["TGFM-5032", IDS.orderWebhook2], ["TGFM-5031", IDS.orderWebhook1]];
  console.log(`-- webhooks for two open orders of one design, ${part === "webhook-seq" ? "older first" : "newer first"}`);
  const bad = await webhook(first[0], { validSignature: false });
  ok("a webhook with a bad signature is rejected (401) and changes nothing", bad.status === 401 && (await inspect(first[1]))[first[1]].paymentStatus === "PENDING");
  const wrongAmount = await webhook(first[0], { amountCents: 100 });
  ok("a correctly signed webhook for a DIFFERENT amount does not mark the order paid", (await inspect(first[1]))[first[1]].paymentStatus === "PENDING", JSON.stringify(wrongAmount.json));
  const wrongCurrency = await webhook(first[0], { currency: "USD" });
  ok("a correctly signed webhook in another currency does not mark the order paid", (await inspect(first[1]))[first[1]].paymentStatus === "PENDING", JSON.stringify(wrongCurrency.json));
  const w1 = await webhook(first[0]); const afterFirst = await inspect(first[1]);
  ok("first payment: PAID, not flagged", w1.status === 200 && afterFirst[first[1]].paymentStatus === "PAID" && !duplicateFlag(afterFirst[first[1]]), JSON.stringify(afterFirst[first[1]]));
  const w2 = await webhook(second[0]); const both = await inspect(first[1], second[1]);
  ok("second payment of the SAME design: recorded as PAID (the money is real) AND flagged for a person to review", w2.status === 200 && both[second[1]].paymentStatus === "PAID" && duplicateFlag(both[second[1]]), JSON.stringify(both[second[1]]));
  ok("the first payment stays unflagged", !duplicateFlag(both[first[1]]));
  // No e-mail provider exists here, so a confirmation e-mail that WOULD be sent shows up as an EMAIL_FAILED audit entry
  // (src/lib/notify/email-failure.ts). That entry proves the e-mail code ran for the normal payment and did not run for the flagged one.
  ok("the e-mail code ran for the normal payment (EMAIL_FAILED entry: no provider here) and did NOT run for the flagged one", both[first[1]].audits.includes("EMAIL_FAILED") && !both[second[1]].audits.includes("EMAIL_FAILED"), JSON.stringify([both[first[1]].audits, both[second[1]].audits]));
  console.log("   -- what the customer sees (every customer page that shows an order status)");
  const [flaggedId, normalId, flaggedNo, normalNo] = [second[1], first[1], second[0], first[0]];
  const flaggedDetail = await page(`/orders/${flaggedId}`); const normalDetail = await page(`/orders/${normalId}`);
  ok("flagged order page: 'Payment received — under review' with the explanation, no 'Confirmed' / 'Payment confirmed' anywhere", /Payment received — under review/.test(flaggedDetail.text) && /reviewing it before production starts/.test(flaggedDetail.text) && !/Confirmed|Payment confirmed|Your order is confirmed/.test(flaggedDetail.text), flaggedDetail.text.slice(flaggedDetail.text.indexOf("Order |"), flaggedDetail.text.indexOf("Order |") + 500));
  ok("normal paid order page stays 'Confirmed'", /Confirmed \| Payment received\. Your order is confirmed\./.test(normalDetail.text) && !/under review/.test(normalDetail.text), normalDetail.text.slice(normalDetail.text.indexOf("Order |"), normalDetail.text.indexOf("Order |") + 300));
  const flaggedCard = await card(flaggedNo); const normalCard = await card(normalNo);
  ok("orders list: the flagged card says under review, not Confirmed; the normal card says Confirmed", /Payment received — under review/.test(flaggedCard) && !/Confirmed/.test(flaggedCard) && /Confirmed/.test(normalCard) && !/under review/.test(normalCard), `${flaggedCard.slice(0, 200)} || ${normalCard.slice(0, 200)}`);
  const filtered = await page("/orders?filter=active");
  ok("the 'In progress' filter includes the order under review", filtered.text.includes(flaggedNo));
  const flaggedSuccess = await page(`/orders/${flaggedId}/success`); const normalSuccess = await page(`/orders/${normalId}/success`);
  ok("success page: under review for the flagged order, 'Payment successful' for the normal one", /Payment received — under review/.test(flaggedSuccess.text) && !/Payment successful|securely confirmed/.test(flaggedSuccess.text) && /Payment successful/.test(normalSuccess.text), flaggedSuccess.text.slice(0, 300));
  console.log("   -- admin side: the entry and the note are kept, payment truth is untouched, and the team moving the order on ends the review");
  const before = (await inspect(flaggedId))[flaggedId];
  ok("audit entry + admin note present and the payment is still PAID", duplicateFlag(before) && before.paymentStatus === "PAID" && before.status === "PAID", JSON.stringify(before));
  await post("/api/qa-sim/set-order", { orderId: flaggedId, status: "IN_PRODUCTION" });
  const moved = await page(`/orders/${flaggedId}`); const afterMove = (await inspect(flaggedId))[flaggedId];
  ok("after the team moves it to production the customer sees 'In production'; the audit entry and note are still stored; PAID is unchanged", /In production/.test(moved.text) && !/under review/.test(moved.text) && duplicateFlag(afterMove) && afterMove.paymentStatus === "PAID", JSON.stringify(afterMove));
  await post("/api/qa-sim/set-order", { orderId: flaggedId, status: "CANCELLED" });
  const cancelled = await page(`/orders/${flaggedId}`); const afterCancel = (await inspect(flaggedId))[flaggedId];
  ok("if the team cancels it the customer sees 'Cancelled' (no refund is made by the app); records and payment status unchanged", /Cancelled/.test(cancelled.text) && duplicateFlag(afterCancel) && afterCancel.paymentStatus === "PAID", JSON.stringify(afterCancel));
  const reorder = await webhook("TGFM-4103"); const re = await inspect(IDS.orderReorder);
  ok("a RE-ORDER (created after the design was paid) is NOT flagged", reorder.status === 200 && re[IDS.orderReorder].paymentStatus === "PAID" && !duplicateFlag(re[IDS.orderReorder]), JSON.stringify(re[IDS.orderReorder]));
}
if (part === "webhook-concurrent") {
  console.log("-- three webhooks for three open orders of one design arrive at the same time");
  const results = await Promise.all([webhook("TGFM-5031"), webhook("TGFM-5032"), webhook("TGFM-5033")]);
  const all = await inspect(IDS.orderWebhook1, IDS.orderWebhook2, IDS.orderWebhook3);
  const list = Object.values(all);
  ok("all three payments are recorded as PAID (money received)", results.every((x) => x.status === 200) && list.every((o) => o.paymentStatus === "PAID"), JSON.stringify(results.map((x) => x.status)));
  const flagged = list.filter(duplicateFlag).length;
  ok("exactly one is the unflagged first payment; the other two are flagged", flagged === 2, `flagged=${flagged} ${JSON.stringify(list.map((o) => [o.orderNumber, o.audits]))}`);
  console.log("   (in PostgreSQL this relies on the design row locks taken in the webhook transaction; the fake only proves the app logic)");
}
if (part === "flagged-only") {
  // leaves the server with one normal and one under-review paid order, for looking at the customer pages in a browser
  await webhook("TGFM-5031"); await webhook("TGFM-5032");
  console.log("  PASS state prepared: TGFM-5031 normal, TGFM-5032 under review");
}

// ---- admin side (needs the QA-only admin user, created by /api/qa-sim/make-admin in the isolated copy)
if (part === "admin" || part === "admin-moveon") {
  const adminJar = new Map();
  const adminStore = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, ...v] = kv.split("="); adminJar.set(k, v.join("=")); } };
  const adminCookie = () => [...adminJar].map(([k, v]) => `${k}=${v}`).join("; ");
  const adminLogin = async () => {
    const csrf = await fetch(`${base}/api/auth/csrf`); adminStore(csrf); const { csrfToken: token } = await csrf.json();
    const res = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: adminCookie() }, body: new URLSearchParams({ csrfToken: token, email: QA_ADMIN.email, password: QA_ADMIN.password, json: "true" }) });
    adminStore(res);
  };
  const adminPage = async (path) => { const res = await fetch(base + path, { headers: { cookie: adminCookie() }, redirect: "manual" }); const raw = await res.text(); return { status: res.status, location: res.headers.get("location"), text: raw.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " | ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/(\s*\|\s*)+/g, " | "), raw }; };
  const flaggedId = IDS.orderWebhook2; const normalId = IDS.orderWebhook1;
  if (part === "admin") {
    console.log("-- admin: a flagged duplicate payment, 60 audit entries AFTER it, and the admin order page");
    await webhook("TGFM-5031"); await webhook("TGFM-5032");
    const noise = await post("/api/qa-sim/add-audit-noise", { orderId: flaggedId, count: 60 });
    ok("60 unrelated audit entries were added after the duplicate-payment entry", noise.status === 200 && noise.json?.added === 60);
    const state = (await inspect(flaggedId))[flaggedId];
    ok("the order carries 61+ audit entries, the duplicate-payment one among them, and the review note", state.audits.length >= 61 && state.audits.includes("PAYMOB_DUPLICATE_DESIGN_PAYMENT") && state.notes.some((n) => /Possible duplicate payment/.test(n)) && state.paymentStatus === "PAID", JSON.stringify({ n: state.audits.length, notes: state.notes.length }));
    ok("customer status endpoint (read-only): flagged -> underReview true, normal -> false", (await (await fetch(`${base}/api/payments/paymob/verify?orderId=${flaggedId}`, { headers: { cookie: me } })).json()).underReview === true && (await (await fetch(`${base}/api/payments/paymob/verify?orderId=${normalId}`, { headers: { cookie: me } })).json()).underReview === false);
    const mk = await fetch(`${base}/api/qa-sim/make-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: QA_ADMIN.email, password: QA_ADMIN.password }) });
    ok("QA admin created (fake database only)", mk.status === 200);
    await adminLogin();
    const anon = await fetch(`${base}/admin/orders/${flaggedId}`, { redirect: "manual", headers: { cookie: me } });
    ok("a normal customer cannot open the admin order page", anon.status !== 200 || !/Possible duplicate payment/.test(await anon.text()), String(anon.status));
    const flagged = await adminPage(`/admin/orders/${flaggedId}`);
    ok("admin order page loads for the admin", flagged.status === 200 && /TGFM-5032/.test(flagged.text), `${flagged.status} ${flagged.location ?? ""} ${flagged.text.slice(0, 200)}`);
    ok("banner: 'Possible duplicate payment: do not produce before review.' names the other order and links to it", /Possible duplicate payment: do not produce before review\./.test(flagged.text) && /This design was also paid on \| ?TGFM-5031/.test(flagged.text) && flagged.raw.includes(`/admin/orders/${normalId}`), flagged.text.slice(0, 400));
    const noiseShown = (flagged.text.match(/QA NOISE/g) ?? []).length;
    ok("the audit TIMELINE is capped at the last 50 entries and the duplicate-payment entry is NOT in it ...", noiseShown === 50 && !/PAYMOB DUPLICATE DESIGN PAYMENT/.test(flagged.text), `noise=${noiseShown}`);
    ok("... yet the banner is still there (it does not depend on that list), and the admin note stays visible", /do not produce before review/.test(flagged.text) && /this design was also paid on order TGFM-5031\. Review for a refund/.test(flagged.text), flagged.text.slice(flagged.text.indexOf("Notes"), flagged.text.indexOf("Notes") + 300));
    const normal = await adminPage(`/admin/orders/${normalId}`);
    ok("the ordinary paid order shows no duplicate banner", normal.status === 200 && !/Possible duplicate payment|duplicate design payment was flagged/.test(normal.text));
    fs.writeFileSync(process.env.QA_ADMIN_COOKIE_FILE ?? "/tmp/qa-admin-cookie.txt", adminCookie());
    console.log("   admin session cookie written for the browser check");
  }
  if (part === "admin-moveon") {
    await adminLogin();
    await post("/api/qa-sim/set-order", { orderId: flaggedId, status: "IN_PRODUCTION" });
    const moved = await adminPage(`/admin/orders/${flaggedId}`);
    ok("after the team moves the order on, the admin page keeps the record but no longer says 'do not produce'", /A duplicate design payment was flagged on this order \(kept as a record\)/.test(moved.text) && !/do not produce before review/.test(moved.text) && /TGFM-5031/.test(moved.text), moved.text.slice(0, 300));
    ok("the audit entry and the note are still stored, PAID unchanged", (await inspect(flaggedId))[flaggedId].audits.includes("PAYMOB_DUPLICATE_DESIGN_PAYMENT") && (await inspect(flaggedId))[flaggedId].paymentStatus === "PAID");
  }
}
