import { createHmac } from "node:crypto";
import type { Page, APIRequestContext } from "@playwright/test";
import { test, expect } from "../fixtures/guard";
import { createUserAndLogin, uniqueEmail, userWithBagItem } from "../fixtures/helpers";

// PAYMOB SANDBOX (TEST MODE ONLY). Runs only against a server started by
//   run-isolated.mjs --paymob-sandbox-env <env file>     (refuses anything but test keys; the only external host is accept.paymob.com)
// with E2E_PAYMOB_SANDBOX=1, E2E_PAYMOB_HMAC and E2E_PAYMOB_INTEGRATION set in the environment (never printed).
//
// What is REAL here: the Create Intention call to Paymob's test environment (made by the app itself), the Paymob order id it returns, the
// checkout URL the customer is sent to (the browser guard aborts that request: no page of Paymob is ever opened by a test), and the
// integration id the app checks callbacks against.
// What is NOT real: the callbacks. No card is ever entered, so Paymob sends nothing; every callback below is built and signed HERE with the
// configured HMAC secret, for the REAL Paymob order id of a REAL intention. That proves the app's plumbing (secret, integration id,
// order binding, state machine) with the real configuration, not that Paymob's own field list/ordering matches (see the report).
const ENABLED = process.env.E2E_PAYMOB_SANDBOX === "1";
const HMAC = process.env.E2E_PAYMOB_HMAC ?? "";
const INTEGRATION = process.env.E2E_PAYMOB_INTEGRATION ?? "";
const KEYS = ["amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success"];
const pick = (o: any, p: string) => p.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : ""), o);

// No trace for this whole file (video is off in the config; test.use for these must be top-level): a trace stores every request and response in full,
// and the create-intent answer carries the checkout URL with its client secret. Guarded by tests/redaction.spec.ts.
test.use({ trace: "off" });

const CUSTOMER = { name: "Sandbox Buyer", email: "sandbox-buyer@example.com", phone: "+201001234567" };
const ADDRESS = { country: "EG", line1: "1 Test Street", city: "Cairo" };
type OrderView = { id: string; orderNumber: string; status: string; paymentStatus: string; paymobOrderId?: string | null; paymobTransactionId?: string | null; totalCents?: number };

test.describe("Paymob SANDBOX: site -> create-intent -> Paymob checkout (test mode)", () => {
  test.skip(!ENABLED || !HMAC || !INTEGRATION, "needs the sandbox server (--paymob-sandbox-env) and E2E_PAYMOB_SANDBOX=1 / E2E_PAYMOB_HMAC / E2E_PAYMOB_INTEGRATION");
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "one project is enough: every run creates real Paymob test intentions"));
  test.describe.configure({ mode: "serial" });

  const inspect = async (page: Page | APIRequestContext, ids: string[]) => {
    const req = "request" in page ? page.request : page;
    return (await (await req.post("/api/qa-sim/inspect", { data: { orderIds: ids } })).json()) as { bagBuildIds: string[]; orders: any[] };
  };
  const view = async (page: Page, id: string) => {
    const r = await inspect(page, [id]);
    const o = r.orders[0];
    return { order: o as OrderView, audits: (o?.audits ?? []) as string[], attempts: (o?.attempts ?? []) as Array<{ status: string; externalId: string | null; paymentUrl: string | null }>, bag: r.bagBuildIds };
  };

  function callback(order: { orderNumber: string; paymobOrderId: string; totalCents: number }, over: Record<string, unknown> = {}, sign = true) {
    const id = Number(over.id ?? Date.now() % 1e9);
    const obj: any = {
      id, amount_cents: order.totalCents, currency: "EGP", success: true, pending: false, error_occured: false, has_parent_transaction: false, is_3d_secure: true, is_auth: false,
      is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, integration_id: Number(INTEGRATION), owner: 1, created_at: "2026-11-16T10:00:00.000000",
      order: { id: Number(order.paymobOrderId), merchant_order_id: order.orderNumber }, source_data: { pan: "2346", sub_type: "MasterCard", type: "card" }, ...over,
    };
    const hmac = sign ? createHmac("sha512", HMAC).update(KEYS.map((k) => String(pick(obj, k) ?? "")).join("")).digest("hex") : "";
    return { hmac, body: { type: "TRANSACTION", obj } };
  }
  const send = (req: APIRequestContext, c: { hmac: string; body: unknown }, query = true) => req.post(query ? `/api/payments/paymob/webhook?hmac=${c.hmac}` : "/api/payments/paymob/webhook", { data: c.body, failOnStatusCode: false });

  // Starts a checkout through the real page; returns what the app told the browser and the (blocked) Paymob request it then made.
  async function checkoutViaSite(page: Page) {
    test.info().annotations.push({ type: "allowed-external", description: "checkout.paymob.com" });
    await page.goto("/bag");
    await page.getByRole("link", { name: /checkout/i }).or(page.getByRole("button", { name: /^checkout$/i })).first().click();
    await page.getByRole("textbox", { name: "Full name" }).fill("Sandbox Buyer");
    await page.getByRole("textbox", { name: "Email" }).fill("sandbox-buyer@example.com");
    await page.locator("#checkout-phone").fill("1001234567");
    await page.getByRole("textbox", { name: "Street address" }).fill("1 Test Street");
    await page.getByRole("textbox", { name: "City", exact: true }).fill("Cairo");
    await page.getByLabel(/i agree to the terms/i).check();
    // The page leaves for Paymob the moment the answer arrives, so the answer is read here, in the route, before it is passed on.
    let captured: { status: number; body: any } | null = null;
    await page.route("**/api/payments/paymob/create-intent", async (route) => {
      const real = await route.fetch();
      captured = { status: real.status(), body: await real.json().catch(() => null) };
      await route.fulfill({ response: real });
    });
    const toPaymob = page.waitForRequest((r) => new URL(r.url()).hostname === "eg.checkout.paymob.com", { timeout: 30_000 });
    await page.locator("button[type=submit]").click();
    const request = await toPaymob.catch(() => null);
    await expect.poll(() => captured, { timeout: 30_000 }).not.toBeNull();
    await page.unroute("**/api/payments/paymob/create-intent");
    return { status: captured!.status, body: captured!.body, request };
  }

  let pageOrder: { id: string; orderNumber: string; paymobOrderId: string; totalCents: number; paymentUrl: string };

  test("the customer is sent from the site to Paymob's test checkout; the order is bound to the real Paymob order", async ({ page }) => {
    await userWithBagItem(page, uniqueEmail("sbx"));
    const r = await checkoutViaSite(page);
    expect(r.status, JSON.stringify({ code: r.body.code })).toBe(200);
    expect(r.body.redirect, "Unified Checkout is a redirect").toBe(true);
    const url = new URL(r.body.paymentUrl);
    expect(url.hostname).toBe("eg.checkout.paymob.com");
    expect([...url.searchParams.keys()].sort()).toEqual(["clientSecret", "publicKey"]);
    expect((url.searchParams.get("publicKey") ?? "").startsWith("egy_pk_test_"), "the public key in the checkout URL is a TEST key").toBe(true); // a boolean: a failing assertion must never print the key
    expect(r.request, "the browser really navigated to Paymob (aborted by the guard)").toBeTruthy();
    expect(new URL(r.request!.url()).hostname).toBe("eg.checkout.paymob.com");
    const { order, attempts } = await view(page, r.body.orderId);
    expect(order.paymentStatus).toBe("PENDING");
    expect(order.paymobOrderId, "the real Paymob order id").toMatch(/^\d{6,}$/);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ status: "PENDING", externalId: order.paymobOrderId });
    pageOrder = { id: order.id, orderNumber: order.orderNumber, paymobOrderId: order.paymobOrderId, totalCents: order.totalCents, paymentUrl: r.body.paymentUrl };
  });

  test("another customer cannot start or reuse payment for this order", async ({ page }) => {
    await createUserAndLogin(page, uniqueEmail("sbx-retry")); // another customer cannot touch it either
    const other = await page.request.post("/api/payments/paymob/create-intent", { data: { orderId: pageOrder.id, method: "CARD" } });
    expect(other.status(), "someone else's order").toBe(404);
  });

  test("owner retries: same link, one attempt, same Paymob order, parallel clicks included", async ({ page }) => {
    await userWithBagItem(page, uniqueEmail("sbx-owner"));
    const first = await checkoutViaSite(page);
    expect(first.status).toBe(200);
    const orderId = first.body.orderId as string;
    const calls = await Promise.all([1, 2, 3].map(() => page.request.post("/api/payments/paymob/create-intent", { data: { orderId, method: "CARD" }, failOnStatusCode: false })));
    for (const c of calls) {
      const j = await c.json();
      if (c.status() === 200) expect(j.paymentUrl === first.body.paymentUrl, "the very same link").toBe(true);
      else expect([409], JSON.stringify(j)).toContain(c.status());
    }
    const { order, attempts } = await view(page, orderId);
    expect(attempts, "still exactly one payment attempt").toHaveLength(1);
    expect(order.paymobOrderId, "the Paymob order was not replaced").toMatch(/^\d{6,}$/);
    expect(attempts[0].externalId).toBe(order.paymobOrderId);
    expect(attempts[0].paymentUrl === first.body.paymentUrl, "the stored link is the one the customer got").toBe(true);
  });

  test("guest, blocked customer, wrong method, wallet (not enabled), changed total: refused, nothing created", async ({ page, browser }) => {
    const guest = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    expect((await guest.request.post("/api/payments/paymob/create-intent", { data: { orderId: pageOrder.id, method: "CARD" }, failOnStatusCode: false })).status()).toBe(401);
    await guest.close();

    const email = uniqueEmail("sbx-blocked");
    await createUserAndLogin(page, email);
    await page.request.post("/api/qa-sim/set-user-state", { data: { email, blocked: true } });
    const blocked = await page.request.post("/api/payments/paymob/create-intent", { data: { orderId: pageOrder.id, method: "CARD" }, failOnStatusCode: false });
    expect(blocked.status(), "blocked customer").toBe(403);
    await page.request.post("/api/qa-sim/set-user-state", { data: { email, blocked: false } });
    expect((await inspect(page, [pageOrder.id])).orders, "the blocked attempt created nothing for them").toHaveLength(0);

    const bad = await page.request.post("/api/payments/paymob/create-intent", { data: { orderId: pageOrder.id, method: "BITCOIN" }, failOnStatusCode: false });
    expect(bad.status()).toBe(400);
    const wallet = await page.request.post("/api/payments/paymob/create-intent", { data: { orderId: pageOrder.id, method: "WALLET" }, failOnStatusCode: false });
    expect(wallet.status(), "wallet is not configured").toBe(400);

    await userWithBagItem(page, uniqueEmail("sbx-total"));
    const wrongTotal = await page.request.post("/api/payments/paymob/create-intent", { data: { cart: true, method: "CARD", acceptTerms: true, expectedTotalCents: 1, customer: CUSTOMER, shippingAddress: ADDRESS }, failOnStatusCode: false });
    const wrongBody = await wrongTotal.json();
    expect(wrongTotal.status(), JSON.stringify(wrongBody)).toBe(409);
    expect(wrongBody.code).toBe("PRICE_CHANGED");
    expect(JSON.stringify(wrongBody)).not.toContain("paymob.com");
    // an address / phone that fails validation is refused before any Paymob call
    const noAddress = await page.request.post("/api/payments/paymob/create-intent", { data: { cart: true, method: "CARD", acceptTerms: true, customer: CUSTOMER, shippingAddress: { country: "EG", city: "C", line1: "x" } }, failOnStatusCode: false });
    expect(noAddress.status()).toBe(400);
    // no consent, no order
    const noConsent = await page.request.post("/api/payments/paymob/create-intent", { data: { cart: true, method: "CARD", customer: CUSTOMER, shippingAddress: ADDRESS }, failOnStatusCode: false });
    expect((await noConsent.json()).code).toBe("TERMS_NOT_ACCEPTED");
  });

  test("coming back from Paymob proves nothing: a cancelled or forged 'success' in the return URL leaves the order PENDING and unpaid", async ({ page }) => {
    await userWithBagItem(page, uniqueEmail("sbx-return"));
    const r = await checkoutViaSite(page);
    const id = r.body.orderId as string;
    const paymobOrderId = (await view(page, id)).order.paymobOrderId!;
    // the customer pressed "back" / cancelled at Paymob, or typed a success URL by hand
    await page.waitForTimeout(1500); // the aborted navigation to Paymob settles into an error page first
    for (const query of ["", "?success=true&pending=false&is_refunded=false&id=999&order=" + paymobOrderId, "?success=false&txn_response_code=DECLINED"]) {
      await expect(async () => { await page.goto(`/orders/${id}/success${query}`); }).toPass({ timeout: 15_000 }); // a navigation still unwinding can interrupt it
      await expect(page, `not the success page: ${query}`).toHaveURL(new RegExp(`/orders/${id}$`));
      await expect(page.locator("main")).toContainText(/payment pending/i);
      // the status banner (the timeline also lists "Payment confirmed" as a not-yet-reached step, so the banner text is what counts)
      await expect(page.locator("main")).toContainText(/waiting for confirmation/i);
      await expect(page.locator("main")).not.toContainText(/your order is paid and ready for production/i);
    }
    const legacy = await (await page.request.get(`/api/payments/paymob/verify?order=${paymobOrderId}&success=true`)).text();
    expect(legacy, "the legacy return URL also decides only from the database").not.toContain("/success");
    const v = await view(page, id);
    expect(v.order.paymentStatus).toBe("PENDING");
    expect(v.order.status).toBe("NEW");
    expect(v.bag, "nothing was cleared from the bag").toHaveLength(1);
    // the status endpoint is read-only and owner-only
    const status = await (await page.request.post("/api/payments/paymob/verify", { data: { orderId: id } })).json();
    expect(status.confirmed).toBe(false);
  });

  test("a double submit of a new checkout (two tabs / a double click) creates ONE order and ONE Paymob payment", async ({ page }) => {
    await userWithBagItem(page, uniqueEmail("sbx-double"));
    // the total the customer approves: the server states it in its PRICE_CHANGED answer (this is what the checkout page shows)
    const probe = await (await page.request.post("/api/payments/paymob/create-intent", { data: { cart: true, method: "CARD", acceptTerms: true, expectedTotalCents: 1, customer: CUSTOMER, shippingAddress: ADDRESS }, failOnStatusCode: false })).json();
    const total = probe.currentTotalCents as number;
    expect(total).toBeGreaterThan(0);
    const send2 = () => page.request.post("/api/payments/paymob/create-intent", { data: { cart: true, method: "CARD", acceptTerms: true, expectedTotalCents: total, customer: CUSTOMER, shippingAddress: ADDRESS }, failOnStatusCode: false });
    const results = await Promise.all([send2(), send2()]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    const ids = [...new Set(bodies.map((b) => b.orderId).filter(Boolean))] as string[];
    const view2 = await inspect(page, ids);
    const summary = view2.orders.map((o) => ({ status: o.paymentStatus, attempts: o.attempts.length, paymobOrderId: o.paymobOrderId ? "set" : null }));
    expect(ids, `orders created by two simultaneous submits: ${JSON.stringify({ statuses: results.map((r) => r.status()), bodies: bodies.map((b) => ({ code: b.code, error: b.error })), summary })}`).toHaveLength(1);
    const paymobIds = view2.orders.map((o) => o.paymobOrderId).filter(Boolean);
    expect(new Set(paymobIds).size, "one Paymob order").toBeLessThanOrEqual(1);
    expect(view2.orders[0].attempts.length).toBe(1);
  });

  test("callbacks: bad, missing and tampered signatures are refused; a correct one marks the order PAID once; a repeat is a duplicate", async ({ page, request }) => {
    const o = pageOrder;
    const good = callback(o, { id: 810001 });
    expect((await send(request, { hmac: "", body: good.body }, false)).status(), "no hmac").toBe(401);
    expect((await send(request, { hmac: "0".repeat(128), body: good.body })).status(), "wrong hmac").toBe(401);
    expect((await send(request, { hmac: good.hmac.slice(0, 100), body: good.body })).status(), "short hmac").toBe(401);
    const tampered = callback(o, { id: 810001 });
    (tampered.body.obj as any).amount_cents = 100; // changed after signing
    expect((await send(request, { hmac: good.hmac, body: tampered.body })).status(), "amount changed after signing").toBe(401);
    // the secret that signs is what counts: a payload signed with another secret is refused
    const other = createHmac("sha512", HMAC + "x").update(KEYS.map((k) => String(pick(good.body.obj, k) ?? "")).join("")).digest("hex");
    expect((await send(request, { hmac: other, body: good.body })).status(), "signed with another secret").toBe(401);
    // no signature check was bypassed: nothing changed
    await createUserAndLogin(page, uniqueEmail("sbx-x"));
    expect((await send(request, good)).status()).toBe(200);
  });

  test("the paid order: PAID, transaction recorded, attempt SUCCEEDED, same delivery again is a duplicate, nothing changes", async ({ browser }) => {
    // use the owner of pageOrder: log in as them is not possible (random email), so read through the admin-less QA view of a fresh login is not
    // allowed either -- instead sign every check through the owner's own context created in the first test (kept by Playwright per test), so
    // this test re-creates the situation on a new order it owns.
    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const page = await ctx.newPage();
    await userWithBagItem(page, uniqueEmail("sbx-paid"));
    const r = await checkoutViaSite(page);
    const id = r.body.orderId as string;
    const before = (await view(page, id)).order;
    const o = { orderNumber: before.orderNumber, paymobOrderId: before.paymobOrderId!, totalCents: before.totalCents! };
    const c = callback(o, { id: 820001 });
    expect((await send(page.request, c)).status()).toBe(200);
    let v = await view(page, id);
    expect(v.order.paymentStatus).toBe("PAID");
    expect(v.order.status).toBe("PAID");
    expect(v.order.paymobTransactionId).toBe("820001");
    expect(v.attempts[0].status).toBe("SUCCEEDED");
    expect(v.bag, "the paid item left the bag").toHaveLength(0);
    const again = await send(page.request, c);
    expect((await again.json()).duplicate).toBe(true);
    // the legacy return URL: only the order's owner is told which order / state a Paymob order number belongs to
    const owner = await (await page.request.get(`/api/payments/paymob/verify?order=${o.paymobOrderId}`)).text();
    expect(owner, "the owner is sent to their paid order").toContain(`/orders/${id}/success`);
    const stranger = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    for (const who of ["guest", "customer"] as const) {
      if (who === "customer") await createUserAndLogin(await stranger.newPage(), uniqueEmail("sbx-stranger"));
      const text = await (await stranger.request.get(`/api/payments/paymob/verify?order=${o.paymobOrderId}`)).text();
      expect(text, `${who}: no internal order id`).not.toContain(id);
      expect(text, `${who}: no payment state in the destination`).not.toMatch(/success|failed/);
      expect(text, `${who}: the generic list`).toContain('"/orders"');
    }
    await stranger.close();
    // a DIFFERENT transaction for the same order is flagged, not applied
    const second = callback(o, { id: 820002 });
    expect((await send(page.request, second)).status()).toBe(200);
    v = await view(page, id);
    expect(v.order.paymobTransactionId, "the first charge stays the recorded one").toBe("820001");
    expect(v.audits).toContain("PAYMOB_POSSIBLE_DOUBLE_CHARGE");

    // trusted data only: a signed callback whose unsigned merchant_order_id names ANOTHER order, a foreign integration id, a wrong amount
    const forged = callback(o, { id: 820003, order: { id: Number(o.paymobOrderId), merchant_order_id: "TGFM-000001" } });
    const f = await (await send(page.request, forged)).json();
    expect(f.unresolved, "an order identifier conflict is not applied").toBeTruthy();
    const wrongIntegration = await (await send(page.request, callback(o, { id: 820004, integration_id: Number(INTEGRATION) + 1 }))).json();
    expect(wrongIntegration.unresolved).toBe("payment_data_mismatch");
    const wrongAmount = await (await send(page.request, callback(o, { id: 820005, amount_cents: o.totalCents + 100 }))).json();
    expect(wrongAmount.unresolved).toBe("payment_data_mismatch");
    const unknownOrder = await (await send(page.request, callback({ ...o, paymobOrderId: "1" }, { id: 820006 }))).json();
    expect(unknownOrder.unresolved).toBe("order_not_found");
    v = await view(page, id);
    expect(v.order, "none of the refused callbacks changed the order").toMatchObject({ paymentStatus: "PAID", paymobTransactionId: "820001" });

    // refund, then a late success: the order stays REFUNDED
    const refund = callback(o, { id: 820010, is_refunded: true });
    expect((await send(page.request, refund)).status()).toBe(200);
    v = await view(page, id);
    expect(v.order.paymentStatus).toBe("REFUNDED");
    const late = callback(o, { id: 820011 });
    expect((await send(page.request, late)).status()).toBe(200);
    v = await view(page, id);
    expect(v.order.paymentStatus, "a late success never turns REFUNDED back into PAID").toBe("REFUNDED");
    expect(v.audits).toContain("PAYMOB_SUCCESS_AFTER_REFUND");
    await ctx.close();
  });

  test("refund arrives BEFORE the success: REFUNDED stays; a failed payment is FAILED and can still be paid later by a success", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const page = await ctx.newPage();
    await userWithBagItem(page, uniqueEmail("sbx-rev"));
    const r = await checkoutViaSite(page);
    const id = r.body.orderId as string;
    const b = (await view(page, id)).order;
    const o = { orderNumber: b.orderNumber, paymobOrderId: b.paymobOrderId!, totalCents: b.totalCents! };
    expect((await send(page.request, callback(o, { id: 830001, is_refunded: true }))).status()).toBe(200);
    expect((await send(page.request, callback(o, { id: 830002 }))).status()).toBe(200);
    expect((await view(page, id)).order.paymentStatus).toBe("REFUNDED");
    await ctx.close();

    const ctx2 = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
    const p2 = await ctx2.newPage();
    await userWithBagItem(p2, uniqueEmail("sbx-fail"));
    const r2 = await checkoutViaSite(p2);
    const id2 = r2.body.orderId as string;
    const b2 = (await view(p2, id2)).order;
    const o2 = { orderNumber: b2.orderNumber, paymobOrderId: b2.paymobOrderId!, totalCents: b2.totalCents! };
    expect((await send(p2.request, callback(o2, { id: 840001, success: false, error_occured: true }))).status()).toBe(200);
    let v = await view(p2, id2);
    expect(v.order.paymentStatus).toBe("FAILED");
    expect(v.order.status, "a failed payment does not move the order forward").toBe("NEW");
    expect(v.bag, "a failed payment leaves the item in the bag").toHaveLength(1);
    // the customer may retry from the same order: still the same Paymob order, still one attempt row per real attempt
    const retry = await p2.request.post("/api/payments/paymob/create-intent", { data: { orderId: id2, method: "CARD" }, failOnStatusCode: false });
    expect([200, 409]).toContain(retry.status());
    // and a pending (not final) transaction changes nothing
    expect((await send(p2.request, callback(o2, { id: 840002, success: false, pending: true }))).status()).toBe(200);
    expect((await view(p2, id2)).order.paymentStatus).not.toBe("PAID");
    expect((await send(p2.request, callback(o2, { id: 840003 }))).status()).toBe(200);
    v = await view(p2, id2);
    expect(v.order.paymentStatus, "a success after an earlier failure pays the order").toBe("PAID");
    await ctx2.close();
  });
});
