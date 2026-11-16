// QA for: stored terms consent on retry, one live payment per design, webhook handling of a design paid twice.
// Usage (each part needs a FRESH isolated server started with --qa-routes, because the checkout endpoint is rate limited):
//   node scripts/isolation/qa/double-payment.mjs terms | live | webhook-seq | webhook-rev | webhook-concurrent | webhook-refund | webhook-m1 | webhook-stream | webhook-binding
// WHAT THIS PROVES: this application's decisions, against the in-memory fake database. WHAT IT DOES NOT PROVE: PostgreSQL row
// locks / isolation, or anything about Paymob. Webhook payloads are signed LOCALLY with a throwaway secret that only the
// isolated copy knows (PAYMOB_HMAC_SECRET set by --qa-routes); nothing is sent to Paymob and no Paymob key exists here.
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { IDS, QA_ADMIN, TEST_USER, paymobIdFor } from "../fake-prisma/seed.mjs";
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
const webhook = async (orderNumber, { amountCents = 49500, success = true, validSignature = true, currency = "EGP", id: fixedId, refunded = false, createdAt = "2026-11-09T10:00:00.000000", padding = 0, paymobOrderId, merchantOrderId } = {}) => {
  const id = fixedId ?? ++txCounter;
  const obj = { id, amount_cents: amountCents, currency, success, pending: false, error_occured: false, has_parent_transaction: false, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: refunded, is_standalone_payment: true, is_voided: false, integration_id: 1, owner: 1, created_at: createdAt, order: { ...(paymobOrderId === null ? {} : { id: Number(paymobOrderId ?? paymobIdFor(orderNumber)) }), ...(merchantOrderId === null ? {} : { merchant_order_id: merchantOrderId ?? orderNumber }) }, source_data: { pan: "2346", sub_type: "MasterCard", type: "card" }, ...(padding ? { padding: "x".repeat(padding) } : {}) };
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

// ---- H3: REFUNDED is terminal for webhook processing (an out-of-order success must not move the order back to PAID)
if (part === "webhook-refund") {
  const count = (list, action) => list.filter((a) => a === action).length;
  const bagHas = async (...ids) => { const b = (await post("/api/qa-sim/inspect", { orderIds: [] })).json.bagBuildIds; return ids.every((i) => b.includes(i)); };

  console.log("-- A. paid, refunded, then a late success with a DIFFERENT transaction id");
  const A = IDS.orderWebhook1, AN = "TGFM-5031";
  const paidA = await webhook(AN, { id: 700001 });
  const stA = (await inspect(A))[A];
  ok("setup: charge 700001 marks the order PAID with its transaction id and a paidAt", paidA.status === 200 && stA.paymentStatus === "PAID" && stA.paymobTransactionId === "700001" && stA.paidAt, JSON.stringify(stA));
  const refundA = await webhook(AN, { id: 700001, refunded: true });
  const rA = (await inspect(A))[A];
  ok("refund event: REFUNDED, refundedAt set, ORIGINAL charge id still on the order", refundA.status === 200 && rA.paymentStatus === "REFUNDED" && rA.refundedAt && rA.paymobTransactionId === "700001", JSON.stringify(rA));
  const refundEntry = rA.auditDetails.find((a) => a.action === "PAYMOB_REFUND_RECORDED");
  ok("refund event is in the audit log with the refund transaction id", refundEntry?.newValue === "700001" && refundEntry?.metadata?.refundTransactionId === "700001", JSON.stringify(refundEntry));
  ok("refund audit entry (paid order): chargeRecorded=true and the stored id IS reported as the original charge", refundEntry?.metadata?.chargeRecorded === true && refundEntry.metadata.originalChargeTransactionId === "700001" && refundEntry.metadata.storedTransactionId === "700001", JSON.stringify(refundEntry));
  ok("refund event: attempt metadata keeps the charge id and records refundTransactionId", rA.attempts[0].metadata?.transactionId === "700001" && rA.attempts[0].metadata?.refundTransactionId === "700001", JSON.stringify(rA.attempts[0]));
  await post("/api/qa-sim/add-bag-item", { orderId: A });
  const emailsBefore = count(rA.audits, "EMAIL_FAILED");
  const lateA = await webhook(AN, { id: 700002 });
  const lA = (await inspect(A))[A];
  ok("late success (different txn): 200 acknowledged", lateA.status === 200 && !lateA.json?.duplicate, JSON.stringify(lateA.json));
  ok("order stays REFUNDED; status, paidAt, refundedAt and the charge transaction id are untouched", lA.paymentStatus === "REFUNDED" && lA.status === rA.status && String(lA.paidAt) === String(rA.paidAt) && String(lA.refundedAt) === String(rA.refundedAt) && lA.paymobTransactionId === "700001", JSON.stringify(lA));
  ok("payment attempt untouched (same status and metadata)", JSON.stringify(lA.attempts) === JSON.stringify(rA.attempts), JSON.stringify([rA.attempts, lA.attempts]));
  ok("no confirmation e-mail was attempted and the bag item was NOT cleared", count(lA.audits, "EMAIL_FAILED") === emailsBefore && (await bagHas(IDS.webhookBuild)), JSON.stringify(lA.audits));
  const lateEntry = lA.auditDetails.find((a) => a.action === "PAYMOB_SUCCESS_AFTER_REFUND");
  ok("PAYMOB_SUCCESS_AFTER_REFUND recorded, flagged as a possible second charge, with both ids", lateEntry?.metadata?.possibleSecondCharge === true && lateEntry.metadata.originalChargeTransactionId === "700001" && lateEntry.metadata.chargeRecorded === true && lateEntry.metadata.storedTransactionId === "700001" && lateEntry.metadata.incomingTransactionId === "700002" && lateEntry.newValue === "700002", JSON.stringify(lateEntry));
  ok("an admin note tells the team to check Paymob for a second charge", lA.notes.some((n) => /different transaction from the original charge \(700001\)/.test(n) && /left REFUNDED/.test(n)), JSON.stringify(lA.notes));
  const again = await webhook(AN, { id: 700002 });
  const l2 = (await inspect(A))[A];
  ok("the SAME late success delivered again is acknowledged as a duplicate and adds nothing", again.json?.duplicate === true && count(l2.audits, "PAYMOB_SUCCESS_AFTER_REFUND") === 1 && l2.notes.length === lA.notes.length, JSON.stringify(again.json));
  const lateSame = await webhook(AN, { id: 700002, amountCents: 49500, success: true });
  ok("(same payload again, third time) still exactly one record", count((await inspect(A))[A].audits, "PAYMOB_SUCCESS_AFTER_REFUND") === 1 && lateSame.status === 200);
  const refundAgain = await webhook(AN, { id: 700003, refunded: true });
  const r2 = (await inspect(A))[A];
  ok("a second refund event: still REFUNDED, refundedAt unchanged, charge id unchanged, its own id recorded", refundAgain.status === 200 && r2.paymentStatus === "REFUNDED" && String(r2.refundedAt) === String(rA.refundedAt) && r2.paymobTransactionId === "700001" && r2.attempts[0].metadata?.refundTransactionId === "700003" && r2.attempts[0].metadata?.transactionId === "700001", JSON.stringify(r2.attempts[0]));

  console.log("-- B. paid, refunded, then a late success with the SAME transaction id (a stale copy of the charge)");
  const B = IDS.orderWebhook2, BN = "TGFM-5032";
  await webhook(BN, { id: 700011 }); await webhook(BN, { id: 700011, refunded: true });
  const rB = (await inspect(B))[B];
  const exactCopy = await webhook(BN, { id: 700011 });
  ok("an exact redelivery of the original charge event is just a processed duplicate (nothing recorded)", exactCopy.json?.duplicate === true && (await inspect(B))[B].auditDetails.every((a) => a.action !== "PAYMOB_SUCCESS_AFTER_REFUND"));
  const lateB = await webhook(BN, { id: 700011, createdAt: "2026-11-09T10:05:00.000000" });
  const lB = (await inspect(B))[B];
  const entryB = lB.auditDetails.find((a) => a.action === "PAYMOB_SUCCESS_AFTER_REFUND");
  ok("same-id late success: order stays REFUNDED and untouched", lateB.status === 200 && lB.paymentStatus === "REFUNDED" && lB.paymobTransactionId === "700011" && String(lB.paidAt) === String(rB.paidAt), JSON.stringify(lB));
  ok("recorded, but NOT flagged as a second charge, and no admin note", entryB?.metadata?.possibleSecondCharge === false && lB.notes.length === rB.notes.length, JSON.stringify(entryB));

  console.log("-- C. refund seen BEFORE the payment (existing behavior preserved; reported, not changed)");
  const C = IDS.orderWebhook3, CN = "TGFM-5033";
  const refundFirst = await webhook(CN, { id: 700021, refunded: true });
  const rC = (await inspect(C))[C];
  ok("refund on an order never seen as paid: REFUNDED, the empty transaction column is filled with the incoming id (as before)", refundFirst.status === 200 && rC.paymentStatus === "REFUNDED" && rC.paymobTransactionId === "700021", JSON.stringify(rC));
  const attemptC = rC.attempts[0]?.metadata ?? {};
  ok("refund-before-payment: the attempt metadata records refundTransactionId=700021 and does NOT put the refund id into transactionId", attemptC.refundTransactionId === "700021" && !("transactionId" in attemptC) && attemptC.paymobOrderId, JSON.stringify(rC.attempts[0]));
  const refundEntryC = rC.auditDetails.find((x) => x.action === "PAYMOB_REFUND_RECORDED");
  ok("refund-before-payment audit entry: refundTransactionId=700021, chargeRecorded=false, originalChargeTransactionId=null (the refund id is NOT labelled the charge), no legacy chargeTransactionId key", refundEntryC?.metadata?.refundTransactionId === "700021" && refundEntryC.metadata.chargeRecorded === false && refundEntryC.metadata.originalChargeTransactionId === null && refundEntryC.metadata.storedTransactionId === null && !("chargeTransactionId" in refundEntryC.metadata), JSON.stringify(refundEntryC));
  const lateC = await webhook(CN, { id: 700022 });
  const lC = (await inspect(C))[C];
  ok("the success that then arrives does NOT resurrect it: still REFUNDED, no paidAt, no PAID", lateC.status === 200 && lC.paymentStatus === "REFUNDED" && !lC.paidAt, JSON.stringify(lC));
  const lateEntryC = lC.auditDetails.find((a) => a.action === "PAYMOB_SUCCESS_AFTER_REFUND");
  ok("it is recorded and flagged as a POSSIBLE second charge, but the stored (refund) id is NOT labelled the original charge: chargeRecorded=false, originalChargeTransactionId=null, storedTransactionId=700021", lateEntryC?.metadata?.possibleSecondCharge === true && lateEntryC.metadata.chargeRecorded === false && lateEntryC.metadata.originalChargeTransactionId === null && lateEntryC.metadata.storedTransactionId === "700021", JSON.stringify(lateEntryC));
  ok("its admin note says the original charge ID is unknown and the stored id may be the refund id (no 'original charge (700021)')", lC.notes.some((n) => /never recorded as paid/.test(n) && /original charge ID is unknown/.test(n) && /may be the refund transaction ID/.test(n) && /700021/.test(n)) && !lC.notes.some((n) => /from the original charge \(/.test(n)), JSON.stringify(lC.notes));

  console.log("-- D. regression guards: normal payments and duplicate-charge detection still work");
  const D = IDS.orderLive1;
  const normal = await webhook("TGFM-5001", { id: 700031 });
  const dd = (await inspect(D))[D];
  ok("an ordinary success on a PENDING order is PAID with the attempt SUCCEEDED and metadata merged", normal.status === 200 && dd.paymentStatus === "PAID" && dd.paymobTransactionId === "700031" && dd.attempts[0].status === "SUCCEEDED" && dd.attempts[0].metadata?.transactionId === "700031", JSON.stringify(dd));
  await webhook("TGFM-5001", { id: 700032 });
  const dd2 = (await inspect(D))[D];
  ok("a second, different success on a PAID order is still flagged PAYMOB_POSSIBLE_DOUBLE_CHARGE and not applied", dd2.audits.includes("PAYMOB_POSSIBLE_DOUBLE_CHARGE") && dd2.paymobTransactionId === "700031" && !dd2.audits.includes("PAYMOB_SUCCESS_AFTER_REFUND"), JSON.stringify(dd2.audits));
}

// ---- M1: the signature is checked BEFORE anything is stored; rejected / oversized / invalid requests do not fill the table
if (part === "webhook-m1") {
  const events = async () => (await post("/api/qa-sim/webhook-events", {})).json.events;
  const raw = async (body, { query = "", headers = {} } = {}) => { const res = await fetch(`${base}/api/payments/paymob/webhook${query}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body }); return { status: res.status, json: await res.json().catch(() => null) }; };
  const before = (await events()).length;

  console.log("-- A. forged / unsigned requests");
  const forged = [];
  for (let i = 0; i < 20; i++) forged.push(await webhook("TGFM-5031", { validSignature: false, padding: 2_000, id: 910000 + i }));
  ok("20 forged requests (distinct payloads) are all rejected with 401", forged.every((r) => r.status === 401), JSON.stringify(forged.map((r) => r.status)));
  const afterForged = await events();
  ok("they created at most ONE small marker row, not 20 rows", afterForged.length - before === 1, `rows added: ${afterForged.length - before}`);
  const marker = afterForged.find((e) => e.eventType === "REJECTED");
  ok("the marker is flagged rejected, carries a few bytes (no attacker payload) and names the reason", marker && marker.validSignature === false && marker.payloadBytes < 100 && /Invalid HMAC signature \(bad_signature\)/.test(marker.errorMessage ?? "") && marker.eventKey.startsWith("rejected:bad_signature:"), JSON.stringify(marker));
  const noSig = await raw(JSON.stringify({ type: "TRANSACTION", obj: { id: 1 } }));
  ok("a request with no signature at all: 401, and a separate 'missing_signature' marker (one row)", noSig.status === 401 && (await events()).filter((e) => e.eventKey.startsWith("rejected:missing_signature:")).length === 1);
  await raw(JSON.stringify({ type: "TRANSACTION", obj: { id: 2 } }));
  ok("repeating it adds nothing", (await events()).filter((e) => e.eventKey.startsWith("rejected:missing_signature:")).length === 1);

  console.log("-- B. oversized and malformed bodies never reach the database");
  const rowsBefore = (await events()).length;
  const huge = await raw(JSON.stringify({ type: "TRANSACTION", obj: { id: 3, padding: "x".repeat(300_000) } }), { query: "?hmac=" + "0".repeat(128) });
  ok("a body over 256 KB: 413", huge.status === 413, JSON.stringify(huge));
  const notJson = await raw("this is not json");
  const jsonNull = await raw("null");
  const jsonArray = await raw("[1,2,3]");
  const jsonNumber = await raw("42");
  ok("invalid JSON, `null`, an array and a number are all 400 (none is a 500)", [notJson, jsonNull, jsonArray, jsonNumber].every((r) => r.status === 400), JSON.stringify([notJson, jsonNull, jsonArray, jsonNumber].map((r) => r.status)));
  ok("none of those wrote a row", (await events()).length === rowsBefore);

  console.log("-- C. a forged copy of a real event does not block the real one");
  const realId = 910100;
  const fake = await webhook("TGFM-5031", { id: realId, validSignature: false });
  const real = await webhook("TGFM-5031", { id: realId });
  const o1 = (await inspect(IDS.orderWebhook1))[IDS.orderWebhook1];
  ok("forged copy: 401; the genuine event that follows is processed (order PAID), not treated as a duplicate", fake.status === 401 && real.status === 200 && !real.json?.duplicate && o1.paymentStatus === "PAID" && o1.paymobTransactionId === String(realId), JSON.stringify([fake.status, real.json, o1.paymentStatus]));
  const again = await webhook("TGFM-5031", { id: realId });
  ok("the genuine event delivered again is a duplicate (unchanged behaviour)", again.json?.duplicate === true);
  const valid = (await events()).filter((e) => e.validSignature === true);
  ok("valid events are stored with validSignature=true", valid.length >= 1 && valid.every((e) => e.eventType !== "REJECTED"));

  console.log("-- D. large VALID events are not collapsed into one key");
  const big2 = await webhook("TGFM-5032", { id: 910201, padding: 70_000 });
  const big3 = await webhook("TGFM-5033", { id: 910202, padding: 70_000 });
  const st = await inspect(IDS.orderWebhook2, IDS.orderWebhook3);
  ok("two different large signed events are BOTH processed (the second is not dropped as a duplicate)", big2.status === 200 && big3.status === 200 && !big3.json?.duplicate && st[IDS.orderWebhook2].paymentStatus === "PAID" && st[IDS.orderWebhook3].paymentStatus === "PAID", JSON.stringify([big2.json, big3.json, st[IDS.orderWebhook2].paymentStatus, st[IDS.orderWebhook3].paymentStatus]));
  const stored = (await events()).filter((e) => e.eventType === "TRANSACTION");
  ok("the stored copy of an oversized event is the small stub (storage still bounded)", stored.some((e) => e.payloadBytes < 100));
}

// ---- M1 (stream limit): the 256 KB limit applies while the body is being READ
if (part === "webhook-stream") {
  const events = async () => (await post("/api/qa-sim/webhook-events", {})).json.events;
  const chunk = new TextEncoder().encode("x".repeat(1024));
  // After the server answers 413 mid-upload it closes that connection; the client may then reuse the dead keep-alive socket for the
  // NEXT request and get "fetch failed" before anything is sent. That is a client artefact, so a request that failed this way is
  // retried once on a fresh connection (a hang or a wrong status is never retried).
  const sendStream = async (makeStream, opts = {}) => {
    const first = await sendStreamOnce(makeStream, opts);
    return first.status === "aborted" && /fetch failed/.test(first.error ?? "") ? sendStreamOnce(makeStream, opts) : first;
  };
  const sendStreamOnce = async (makeStream, { timeoutMs = 8000 } = {}) => {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs); const t = performance.now();
    try {
      const res = await fetch(`${base}/api/payments/paymob/webhook?hmac=${"0".repeat(128)}`, { method: "POST", headers: { "content-type": "application/json" }, body: makeStream(), duplex: "half", signal: ctrl.signal });
      return { status: res.status, ms: Math.round(performance.now() - t), sent: null };
    } catch (error) { return { status: "aborted", ms: Math.round(performance.now() - t), error: String(error?.message ?? error) }; }
    finally { clearTimeout(timer); }
  };
  const before = (await events()).length;

  console.log("-- E. a chunked request with NO Content-Length and an endless body");
  let produced = 0;
  const endless = () => new ReadableStream({ pull(c) { produced++; c.enqueue(chunk); }, cancel() {} });
  const e = await sendStream(endless);
  ok("answered 413 while the body was still arriving (it was not buffered to the end)", e.status === 413, JSON.stringify(e));
  ok(`the client had only sent a bounded amount when the server gave up (${produced} KB, limit 256 KB)`, produced < 4096, `produced=${produced}`);
  ok("it wrote nothing to the database", (await events()).length === before);

  console.log("-- F. chunked body just over the limit, and chunked malformed JSON");
  const over = await sendStream(() => new ReadableStream({ start(c) { for (let i = 0; i < 300; i++) c.enqueue(chunk); c.close(); } }));
  ok("a chunked 300 KB body: 413", over.status === 413, JSON.stringify(over));
  const bad = await sendStream(() => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("{ this is not json")); c.close(); } }));
  ok("a chunked body of malformed JSON: 400", bad.status === 400, JSON.stringify(bad));
  const small = await sendStream(() => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify({ type: "TRANSACTION", obj: { id: 1 } }))); c.close(); } }));
  ok("a small chunked body with a bad signature: 401 (same as a normal request)", small.status === 401, JSON.stringify(small));
  ok("none of those wrote a payload row (at most the one bounded rejection marker)", (await events()).length - before <= 1);
}

// ---- Order binding: the SIGNED Paymob order id decides which order a webhook belongs to; the unsigned merchant_order_id never does
if (part === "webhook-binding") {
  const count = (list, a) => list.filter((x) => x === a).length;
  const events = async () => (await post("/api/qa-sim/webhook-events", {})).json.events;
  const unresolvedEvent = async (message) => (await events()).filter((e) => e.errorMessage === message).length;
  const V = IDS.orderWebhook1, VN = "TGFM-5031";   // the victim: another customer's order, same amount and currency
  const A = IDS.orderWebhook2, AN = "TGFM-5032";   // the attacker's own legitimately paid order

  console.log("-- A. a valid signed order id");
  const good = await webhook(AN, { id: 930001 });
  const a1 = (await inspect(A))[A];
  ok("signed order id = the id stored when the payment was created: the order is PAID (merchant_order_id agrees)", good.status === 200 && a1.paymentStatus === "PAID" && a1.paymobTransactionId === "930001", JSON.stringify([good.json, a1.paymentStatus]));
  const noMerchant = await webhook("TGFM-5033", { id: 930002, merchantOrderId: null });
  const c1 = (await inspect(IDS.orderWebhook3))[IDS.orderWebhook3];
  ok("a webhook with NO merchant_order_id at all is still matched through the signed id and paid", noMerchant.status === 200 && c1.paymentStatus === "PAID", JSON.stringify([noMerchant.json, c1.paymentStatus]));

  console.log("-- B. forged merchant_order_id pointing at another customer's order (the attacker replays their own genuine signed callback)");
  const forged = await webhook(VN, { id: 930003, paymobOrderId: paymobIdFor(AN) }); // signed order.id is the ATTACKER's order; merchant_order_id names the victim
  const v1 = (await inspect(V))[V];
  ok("answered 200 'unresolved', and the victim's order is NOT touched (still PENDING, no transaction id, no paidAt)", forged.status === 200 && forged.json?.unresolved && v1.paymentStatus === "PENDING" && !v1.paymobTransactionId && !v1.paidAt, JSON.stringify([forged.json, v1.paymentStatus, v1.paymobTransactionId]));
  ok("the victim's payment attempt and audit trail are untouched", v1.attempts[0].status === "PENDING" && !v1.attempts[0].metadata?.transactionId && v1.audits.length === 0, JSON.stringify([v1.attempts, v1.audits]));
  const a2 = (await inspect(A))[A];
  ok("the attacker's own (already paid) order is not changed either: no second transaction id, no duplicate-charge flag", a2.paymobTransactionId === "930001" && !a2.audits.includes("PAYMOB_POSSIBLE_DOUBLE_CHARGE"), JSON.stringify([a2.paymobTransactionId, a2.audits]));
  ok("it is recorded for the admin page as a conflict between the signed id and the merchant reference", (await unresolvedEvent("Signed Paymob order id conflicts with the merchant order reference")) === 1);

  console.log("-- C. conflicting signed and unsigned identifiers (both name real orders, different ones)");
  const conflict = await webhook("TGFM-4103", { id: 930004, paymobOrderId: paymobIdFor(VN) });
  const re = (await inspect(IDS.orderReorder))[IDS.orderReorder];
  ok("signed id belongs to order A, merchant reference names order B: nothing is modified, on either", conflict.status === 200 && conflict.json?.unresolved === "order_identifier_conflict" && re.paymentStatus === "PENDING" && (await inspect(V))[V].paymentStatus === "PENDING", JSON.stringify(conflict.json));

  console.log("-- D. unknown, missing and unstored signed ids");
  const unknown = await webhook(VN, { id: 930005, paymobOrderId: "123456789" });
  ok("an unknown signed order id: unresolved, no order modified", unknown.status === 200 && unknown.json?.unresolved === "order_not_found" && (await inspect(V))[V].paymentStatus === "PENDING", JSON.stringify(unknown.json));
  const missing = await webhook(VN, { id: 930006, paymobOrderId: null });
  ok("NO signed order id in the payload: unresolved, no order modified (the merchant reference alone is never enough)", missing.status === 200 && missing.json?.unresolved === "order_not_found" && (await inspect(V))[V].paymentStatus === "PENDING", JSON.stringify(missing.json));
  const onlyMerchant = await webhook(VN, { id: 930007, paymobOrderId: null });
  ok("(same again, different event) still unresolved", onlyMerchant.json?.unresolved === "order_not_found");
  const unstored = await webhook("TGFM-5002", { id: 930008, paymobOrderId: "555000111" }); // TGFM-5002 never had a Paymob order id stored
  ok("an order with NO stored Paymob order id cannot be matched by a merchant reference (unresolved, order untouched)", unstored.json?.unresolved === "order_not_found" && (await inspect(IDS.orderLive2))[IDS.orderLive2].paymentStatus === "UNPAID", JSON.stringify(unstored.json));
  const unstored2 = await webhook("TGFM-5002", { id: 930009, paymobOrderId: null });
  ok("...and with no signed id at all either", unstored2.json?.unresolved === "order_not_found" && (await inspect(IDS.orderLive2))[IDS.orderLive2].paymentStatus === "UNPAID");

  console.log("-- E. a retry created a newer Paymob order; the customer pays on the OLDER, still open link");
  const O = IDS.orderOldLink;
  const oldLink = await webhook("TGFM-5051", { id: 930010, paymobOrderId: paymobIdFor("TGFM-5051") }); // the older id lives only in PaymentAttempt.externalId
  const o1 = (await inspect(O))[O];
  ok("matched through the older attempt's persisted id: the money is recorded, order PAID", oldLink.status === 200 && o1.paymentStatus === "PAID" && o1.paymobTransactionId === "930010", JSON.stringify([oldLink.json, o1.paymentStatus]));

  console.log("-- F. duplicates, concurrency, refunds still behave");
  const dup = await webhook(AN, { id: 930001 });
  ok("the genuine event delivered again is still a duplicate", dup.json?.duplicate === true);
  const rep = await Promise.all([1, 2, 3, 4, 5].map(() => webhook(VN, { id: 930011 })));
  const v2 = (await inspect(V))[V];
  // (this design was already paid on the attacker's order above, so the one processed delivery is flagged for review and sends no e-mail; five processings would leave five flags)
  ok("five simultaneous deliveries of one valid event: exactly one is processed (4 duplicates), the order is PAID once, its side effects happen once", rep.every((r) => r.status === 200) && rep.filter((r) => r.json?.duplicate).length === 4 && v2.paymentStatus === "PAID" && v2.paymobTransactionId === "930011" && count(v2.audits, "PAYMOB_DUPLICATE_DESIGN_PAYMENT") === 1, JSON.stringify([rep.map((r) => r.json), v2.audits]));
  const refund = await webhook(AN, { id: 930001, refunded: true });
  const a3 = (await inspect(A))[A];
  ok("a refund event (signed order id) still refunds the order and keeps the charge id", refund.status === 200 && a3.paymentStatus === "REFUNDED" && a3.paymobTransactionId === "930001", JSON.stringify([refund.json, a3.paymentStatus]));
  const forgedRefund = await webhook(VN, { id: 930012, refunded: true, paymobOrderId: paymobIdFor(AN) });
  ok("a forged refund (victim's merchant reference, attacker's signed id) does not refund the victim", forgedRefund.json?.unresolved === "order_identifier_conflict" && (await inspect(V))[V].paymentStatus === "PAID");
}
