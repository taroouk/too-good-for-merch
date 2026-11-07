// Fixed seed data for the Fake Prisma database (Studio/Builder path only). Everything here is FAKE:
// test.invalid-style identities, a throwaway password for the isolated copy, and a 1x1 PNG.
// The password only exists in the in-memory fake database and only works against the isolated copy.
import { createHash } from "node:crypto";

export const TEST_USER = { id: "usr_fake_test", email: "test@tgfm.test", password: "UDIhiW1tOAliMP8BnLHb" };
// A throwaway admin that exists ONLY when the QA route /api/qa-sim/make-admin is called (isolated copy); never seeded by default.
export const QA_ADMIN = { email: "qa-admin@tgfm.test", password: "qa-admin-oEMUOFH58pG8j-Uo" };
export const OTHER_USER = { id: "usr_fake_other", email: "other@tgfm.test" };
export const IDS = {
  savedBuild: "bld_fake_saved", // owned by TEST_USER, has a design, an upload and a print mockup
  guestBuild: "bld_fake_guest", // no owner (guest cookie flow)
  otherBuild: "bld_fake_other", // owned by OTHER_USER (access-denied scenarios)
  savedAsset: "ast_fake_saved",
  savedMockup: "mck_fake_saved",
  cartBuild2: "bld_fake_cart2", // second and third items of the test user's bag (one checkout for the whole bag)
  cartBuild3: "bld_fake_cart3",
  cartAsset2: "ast_fake_cart2",
  otherAsset: "ast_fake_other", // belongs to OTHER_USER's build (cross-user access tests)
  otherPrintMockup: "mck_fake_other_print",
  // payment-path fixtures (create-intent retry / duplicate-prevention / ownership tests)
  orderReuse: "ord_fake_pending_reuse", // PENDING + a fresh PENDING attempt with a payment link
  orderInFlight: "ord_fake_in_flight", // a CREATED attempt (no link yet) from the last few seconds
  orderPaid: "ord_fake_paid",
  orderOther: "ord_fake_other_user", // belongs to OTHER_USER
  orderCancelled: "ord_fake_cancelled_unpaid", // CANCELLED by an admin, still UNPAID
  orderRefunded: "ord_fake_refunded",
  orderInProduction: "ord_fake_in_production_unpaid",
  orderStaleCurrency: "ord_fake_stale_currency", // created in another currency
  orderSuperseded: "ord_fake_superseded", // unpaid, but its design was paid on another order afterwards
  orderSupersedingPaid: "ord_fake_superseding_paid",
  orderReorder: "ord_fake_reorder_after_paid", // unpaid order created AFTER the same design was paid: a legitimate re-order
  dupBuild: "bld_fake_dup",
  // double-payment / terms / webhook fixtures (see qa/double-payment.mjs)
  liveBuild: "bld_fake_live", orderLive1: "ord_fake_live_link", orderLive2: "ord_fake_live_competitor",
  expiredBuild: "bld_fake_expired", orderExpired1: "ord_fake_expired_link", orderExpired2: "ord_fake_expired_second",
  flightBuild: "bld_fake_flight", orderFlight1: "ord_fake_in_flight_first", orderFlight2: "ord_fake_in_flight_second",
  webhookBuild: "bld_fake_webhook", orderWebhook1: "ord_fake_webhook_1", orderWebhook2: "ord_fake_webhook_2", orderWebhook3: "ord_fake_webhook_3",
  orderConsentOk: "ord_fake_consent_ok", orderConsentOld: "ord_fake_consent_old", orderConsentNone: "ord_fake_consent_none",
  multiBuild: "bld_fake_multi", // artworks on two placements (RIGHT_CHEST carries a price rule) and NO placement notes
  otherAiMockup: "mck_fake_other_ai",
};

// A valid 1x1 PNG (generated artwork stand-in; no real image data from the project).
export const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export async function seedDatabase(client) {
  let hash;
  try {
    const mod = await import("argon2");
    hash = await (mod.default ?? mod).hash(TEST_USER.password);
  } catch (error) {
    throw new Error(`[fake-prisma] cannot hash the test password (argon2 unavailable): ${error.message}`);
  }
  const db = client;
  await db.user.create({ data: { id: TEST_USER.id, email: TEST_USER.email, passwordHash: hash, role: "USER" } });
  await db.user.create({ data: { id: OTHER_USER.id, email: OTHER_USER.email, role: "USER" } });

  await db.storeSetting.create({ // currency "USD" on purpose: it is the schema default, and payments must not depend on this column (audit fix 4)
  data: { id: "store", currency: "USD", displayCurrency: "EGP", usdToEgpRate: 50 } });
  const fabrics = [
    ["ESSENTIALS_170", "ESSENTIALS", "170 GSM Cotton", "Lightweight everyday cotton with a clean minimal hand feel.", 10],
    ["SIGNATURE_200", "SIGNATURE", "200 GSM Cotton", "Our balanced premium weight. Smooth, buttery, structured, and designed to hold its shape.", 20],
    ["HEAVYWEIGHT_300", "HEAVYWEIGHT", "300 GSM Cotton", "Dense luxury cotton with elevated structure and a substantial drape.", 30],
  ];
  for (const [key, name, gsm, description, sortOrder] of fabrics) await db.catalogFabric.create({ data: { key, name, gsm, description, sortOrder, active: true } });
  await db.catalogProduct.create({ data: { product: "FITTED", name: "Fitted T-Shirt", tagline: "Classic" } });
  await db.catalogProduct.create({ data: { product: "OVERSIZED", name: "Oversized T-Shirt", tagline: "Relaxed" } });

  // A saved design: Build + draft + upload + print mockup.
  await db.build.create({
    data: { id: IDS.savedBuild, userId: TEST_USER.id, name: "Saved design", status: "ACTIVE", draft: { create: { product: "FITTED", color: "BLACK", fabric: "SIGNATURE_200", quantity: 1 } } },
  });
  await db.asset.create({
    data: {
      id: IDS.savedAsset, buildId: IDS.savedBuild, fileName: "fake-art.png", mimeType: "image/png", sizeBytes: TINY_PNG.length, status: "READY",
      artworkData: TINY_PNG, artworkSha256: sha256(TINY_PNG), url: `/api/assets/${IDS.savedAsset}/file`,
    },
  });
  await db.mockup.create({
    data: { id: IDS.savedMockup, buildId: IDS.savedBuild, kind: "PRINT", mimeType: "image/png", data: TINY_PNG, sha256: sha256(TINY_PNG), width: 1, height: 1, fingerprint: "fake-fingerprint", placement: "CENTER_FRONT" },
  });
  await db.buildDraft.update({
    where: { buildId: IDS.savedBuild },
    data: {
      primaryAssetId: IDS.savedAsset,
      artworkLayers: [{ placement: "CENTER_FRONT", assetId: IDS.savedAsset, x: 0, y: 0, scale: 1, rotation: 0 }],
      artworkPlacement: { placement: "CENTER_FRONT", x: 0, y: 0, scale: 1, rotation: 0 },
      printMockupId: IDS.savedMockup, printMockupFingerprint: "fake-fingerprint", printMockupGeneratedAt: new Date(),
    },
  });

  await db.build.create({ data: { id: IDS.guestBuild, userId: null, name: "Untitled", status: "ACTIVE", draft: { create: { quantity: 1 } } } });
  await db.build.create({ data: { id: IDS.otherBuild, userId: OTHER_USER.id, name: "Someone else", status: "ACTIVE", draft: { create: { product: "OVERSIZED", color: "WHITE", fabric: "ESSENTIALS_170", quantity: 1 } } } });
  // OTHER_USER's build owns a real upload and both mockup kinds, so ownership checks have something to protect.
  await db.asset.create({
    data: {
      id: IDS.otherAsset, buildId: IDS.otherBuild, fileName: "other-art.png", mimeType: "image/png", sizeBytes: TINY_PNG.length, status: "READY",
      artworkData: TINY_PNG, artworkSha256: sha256(TINY_PNG), url: `/api/assets/${IDS.otherAsset}/file`,
    },
  });
  for (const [id, kind] of [[IDS.otherPrintMockup, "PRINT"], [IDS.otherAiMockup, "AI"]]) {
    await db.mockup.create({ data: { id, buildId: IDS.otherBuild, kind, mimeType: "image/png", data: TINY_PNG, sha256: sha256(TINY_PNG), width: 1, height: 1, fingerprint: `fake-other-${kind}`, placement: "CENTER_FRONT" } });
  }

  // One order per customer-visible status, for the Orders / order-page wording checks.
  const statuses = [
    ["TGFM-1001", "NEW", "PENDING"],
    ["TGFM-1002", "PAID", "PAID"],
    ["TGFM-1003", "IN_PRODUCTION", "PAID"],
    ["TGFM-1004", "SHIPPED", "PAID"],
    ["TGFM-1005", "COMPLETED", "PAID"],
    ["TGFM-1006", "CANCELLED", "UNPAID"],
  ];
  for (const [i, [orderNumber, status, paymentStatus]] of statuses.entries()) {
    await db.order.create({
      data: {
        orderNumber, status, paymentStatus, userId: TEST_USER.id, buildId: IDS.savedBuild, currency: "EGP",
        customerName: "Test Customer", customerEmail: TEST_USER.email, customerPhone: "01000000000", shippingCountry: "EG", shippingCity: "Cairo", shippingAddressLine1: "1 Test Street",
        subtotalCents: 49500, totalCents: 49500, canonicalTotalUsdCents: 990, exchangeRateUsed: 50, paidAt: paymentStatus === "PAID" ? new Date() : null,
        ...(status === "SHIPPED" ? { carrier: "Test Carrier", trackingNumber: "TRK123", trackingUrl: "https://example.invalid/track", shippedAt: new Date() } : {}),
        createdAt: new Date(Date.now() - i * 3600_000),
        items: {
          create: {
            product: "OVERSIZED", color: "BLACK", fabric: "SIGNATURE_200", quantity: 1, unitPriceCents: 990, totalCents: 990, placements: ["CENTER_FRONT"], assetId: IDS.savedAsset,
            preview: { size: "M", taxCents: 0, shippingCents: 0, printMockupId: IDS.savedMockup, aiMockupId: null, layers: [{ placement: "CENTER_FRONT", assetId: IDS.savedAsset, x: 0, y: 0, scale: 1, rotation: 0 }] },
          },
        },
      },
    });
  }

  // Payment-path fixtures. Amounts are EGP piastres (49500 = EGP 495).
  const payOrder = (id, orderNumber, userId, extra = {}, attempt = null) => db.order.create({
    data: {
      id, orderNumber, userId, buildId: userId === TEST_USER.id ? IDS.savedBuild : IDS.otherBuild, currency: "EGP", subtotalCents: 49500, totalCents: 49500,
      canonicalTotalUsdCents: 990, exchangeRateUsed: 50, customerName: "Test Customer", customerEmail: TEST_USER.email, customerPhone: "01000000000",
      shippingCountry: "EG", shippingCity: "Cairo", shippingAddressLine1: "1 Test Street",
      items: { create: { product: "OVERSIZED", color: "BLACK", fabric: "SIGNATURE_200", quantity: 1, unitPriceCents: 990, totalCents: 990, placements: ["CENTER_FRONT"], preview: { size: "M" } } },
      ...(attempt ? { paymentAttempts: { create: attempt } } : {}),
      ...extra,
    },
  });
  // These two carry a live payment link / a payment being created, so they are tied to NO design (buildId null): a design with
  // a live payment blocks other orders for that design (audit fix 2), which would otherwise leak into every test of the saved build.
  await payOrder(IDS.orderReuse, "TGFM-2001", TEST_USER.id, { buildId: null, paymentStatus: "PENDING", paymentMethod: "CARD", paymentUrl: "https://payments.example.invalid/pay/2001" },
    { method: "CARD", status: "PENDING", amountCents: 49500, currency: "EGP", externalId: "fake-2001", paymentUrl: "https://payments.example.invalid/pay/2001" });
  await payOrder(IDS.orderInFlight, "TGFM-2002", TEST_USER.id, { buildId: null, paymentStatus: "PENDING" }, { method: "CARD", status: "CREATED", amountCents: 49500, currency: "EGP" });
  // buildId null: a paid order for the saved design would (correctly) supersede the other seeded orders of that design
  await payOrder(IDS.orderPaid, "TGFM-2003", TEST_USER.id, { paymentStatus: "PAID", status: "PAID", paidAt: new Date(), buildId: null });
  await payOrder(IDS.orderOther, "TGFM-3001", OTHER_USER.id, { paymentStatus: "PENDING" });

  // The test user's bag: three different designs, sizes and quantities (one checkout, one payment).
  await db.build.create({ data: { id: IDS.cartBuild2, userId: TEST_USER.id, name: "Cart design 2", status: "ACTIVE", draft: { create: { product: "OVERSIZED", color: "WHITE", fabric: "ESSENTIALS_170", quantity: 2 } } } });
  await db.asset.create({
    data: { id: IDS.cartAsset2, buildId: IDS.cartBuild2, fileName: "cart-art.png", mimeType: "image/png", sizeBytes: TINY_PNG.length, status: "READY", artworkData: TINY_PNG, artworkSha256: sha256(TINY_PNG), url: `/api/assets/${IDS.cartAsset2}/file` },
  });
  await db.buildDraft.update({
    where: { buildId: IDS.cartBuild2 },
    data: { primaryAssetId: IDS.cartAsset2, artworkLayers: [{ placement: "CENTER_BACK", assetId: IDS.cartAsset2, x: 0, y: 0, scale: 1, rotation: 0 }], artworkPlacement: { placement: "CENTER_BACK", x: 0, y: 0, scale: 1, rotation: 0 } },
  });
  await db.build.create({ data: { id: IDS.cartBuild3, userId: TEST_USER.id, name: "Cart design 3", status: "ACTIVE", draft: { create: { product: "OVERSIZED", color: "BLACK", fabric: "HEAVYWEIGHT_300", quantity: 1 } } } });
  await db.bagItem.create({ data: { userId: TEST_USER.id, buildId: IDS.savedBuild, size: "M" } });
  await db.bagItem.create({ data: { userId: TEST_USER.id, buildId: IDS.cartBuild2, size: "L" } });
  await db.bagItem.create({ data: { userId: TEST_USER.id, buildId: IDS.cartBuild3, size: "S" } });

  // --- audit-fix fixtures ---------------------------------------------------------------------------------------
  // A placement price rule (USD per unit) so the price depends on which placements a design uses.
  await db.placementPricingRule.create({ data: { placement: "RIGHT_CHEST", unitPrice: 2 } });
  await db.build.create({
    data: { id: IDS.multiBuild, userId: TEST_USER.id, name: "Two placements", status: "ACTIVE", draft: { create: { product: "OVERSIZED", color: "BLACK", fabric: "SIGNATURE_200", quantity: 1 } } },
  });
  await db.asset.create({ data: { id: "ast_fake_multi", buildId: IDS.multiBuild, fileName: "multi-art.png", mimeType: "image/png", sizeBytes: TINY_PNG.length, status: "READY", artworkData: TINY_PNG, artworkSha256: sha256(TINY_PNG), url: "/api/assets/ast_fake_multi/file" } });
  await db.buildDraft.update({
    where: { buildId: IDS.multiBuild },
    data: { primaryAssetId: "ast_fake_multi", artworkLayers: [
      { placement: "CENTER_FRONT", assetId: "ast_fake_multi", x: 0, y: 0, scale: 1, rotation: 0 },
      { placement: "RIGHT_CHEST", assetId: "ast_fake_multi", x: 0, y: 0, scale: 1, rotation: 0 },
    ] },
  });
  await db.build.create({ data: { id: IDS.dupBuild, userId: TEST_USER.id, name: "Dup design", status: "ACTIVE", draft: { create: { product: "FITTED", color: "WHITE", fabric: "ESSENTIALS_170", quantity: 1 } } } });
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000);
  await payOrder(IDS.orderCancelled, "TGFM-4001", TEST_USER.id, { status: "CANCELLED", paymentStatus: "UNPAID" });
  await payOrder(IDS.orderRefunded, "TGFM-4002", TEST_USER.id, { status: "CANCELLED", paymentStatus: "REFUNDED", paidAt: ago(500), refundedAt: ago(400) });
  await payOrder(IDS.orderInProduction, "TGFM-4003", TEST_USER.id, { status: "IN_PRODUCTION", paymentStatus: "UNPAID" });
  await payOrder(IDS.orderStaleCurrency, "TGFM-4004", TEST_USER.id, { currency: "USD", paymentStatus: "PENDING" });
  // Same design on three orders: X (older, unpaid) was superseded by Y (a bag order paid later); Z is a re-order made after Y was paid.
  await payOrder(IDS.orderSuperseded, "TGFM-4101", TEST_USER.id, { buildId: IDS.dupBuild, paymentStatus: "PENDING", createdAt: ago(120) });
  await db.order.create({
    data: {
      id: IDS.orderSupersedingPaid, orderNumber: "TGFM-4102", userId: TEST_USER.id, buildId: null, currency: "EGP", subtotalCents: 99000, totalCents: 99000, status: "PAID", paymentStatus: "PAID",
      paidAt: ago(30), createdAt: ago(60), customerName: "Test Customer", customerEmail: TEST_USER.email, customerPhone: "01000000000", shippingCountry: "EG", shippingCity: "Cairo", shippingAddressLine1: "1 Test Street",
      items: { create: [
        { product: "FITTED", color: "WHITE", fabric: "ESSENTIALS_170", quantity: 1, unitPriceCents: 802, totalCents: 802, placements: ["CENTER_FRONT"], preview: { buildId: IDS.dupBuild, size: "M", cart: true } },
        { product: "OVERSIZED", color: "BLACK", fabric: "SIGNATURE_200", quantity: 1, unitPriceCents: 990, totalCents: 990, placements: ["CENTER_FRONT"], preview: { buildId: IDS.savedBuild, size: "M", cart: true } },
      ] },
    },
  });
  await payOrder(IDS.orderReorder, "TGFM-4103", TEST_USER.id, { buildId: IDS.dupBuild, paymentStatus: "PENDING", createdAt: new Date() });

  // --- double payment / terms / webhook fixtures ---------------------------------------------------------------------
  const plainBuild = (id, name) => db.build.create({ data: { id, userId: TEST_USER.id, name, status: "ACTIVE", draft: { create: { product: "FITTED", color: "WHITE", fabric: "ESSENTIALS_170", quantity: 1 } } } });
  for (const [id, name] of [[IDS.liveBuild, "Live link"], [IDS.expiredBuild, "Expired link"], [IDS.flightBuild, "In flight"], [IDS.webhookBuild, "Webhook design"]]) await plainBuild(id, name);
  const attempt = (status, minutesAgo, link) => ({ method: "CARD", status, amountCents: 49500, currency: "EGP", ...(link ? { paymentUrl: link, externalId: `fake-${minutesAgo}` } : {}), createdAt: ago(minutesAgo) });
  // 1. a payment link opened 5 minutes ago on one order; a second open order for the same design
  await payOrder(IDS.orderLive1, "TGFM-5001", TEST_USER.id, { buildId: IDS.liveBuild, paymentStatus: "PENDING", paymentMethod: "CARD", paymentUrl: "https://payments.example.invalid/pay/5001", createdAt: ago(10) }, attempt("PENDING", 5, "https://payments.example.invalid/pay/5001"));
  await payOrder(IDS.orderLive2, "TGFM-5002", TEST_USER.id, { buildId: IDS.liveBuild, paymentStatus: "UNPAID", createdAt: ago(8) });
  // 2. the first link is 90 minutes old (expired at Paymob), so the second order may start its own payment
  await payOrder(IDS.orderExpired1, "TGFM-5011", TEST_USER.id, { buildId: IDS.expiredBuild, paymentStatus: "PENDING", paymentMethod: "CARD", paymentUrl: "https://payments.example.invalid/pay/5011", createdAt: ago(100) }, attempt("PENDING", 90, "https://payments.example.invalid/pay/5011"));
  await payOrder(IDS.orderExpired2, "TGFM-5012", TEST_USER.id, { buildId: IDS.expiredBuild, paymentStatus: "UNPAID", createdAt: ago(80) });
  // 3. a payment for the first order is being started right now (attempt created a few seconds ago)
  await payOrder(IDS.orderFlight1, "TGFM-5021", TEST_USER.id, { buildId: IDS.flightBuild, paymentStatus: "PENDING", createdAt: ago(2) }, { method: "CARD", status: "CREATED", amountCents: 49500, currency: "EGP", createdAt: new Date(Date.now() - 5000) });
  await payOrder(IDS.orderFlight2, "TGFM-5022", TEST_USER.id, { buildId: IDS.flightBuild, paymentStatus: "UNPAID", createdAt: ago(1) });
  // 4. three open orders for one design, each waiting for a webhook (the first two arrive in different orders in the tests)
  for (const [i, id] of [IDS.orderWebhook1, IDS.orderWebhook2, IDS.orderWebhook3].entries()) {
    await payOrder(id, `TGFM-503${i + 1}`, TEST_USER.id, { buildId: IDS.webhookBuild, paymentStatus: "PENDING", paymentMethod: "CARD", createdAt: ago(20 - i) },
      { method: "CARD", status: "PENDING", amountCents: 49500, currency: "EGP", paymentUrl: `https://payments.example.invalid/pay/503${i + 1}`, externalId: `fake-503${i + 1}`, createdAt: ago(15 - i) });
  }
  // 5. stored consent on three retry-able (FAILED) orders: matching revision, an old revision, none at all
  const consent = { buildId: null, paymentStatus: "FAILED", paymentFailureReason: "Paymob could not complete this payment." };
  await payOrder(IDS.orderConsentOk, "TGFM-5041", TEST_USER.id, { ...consent, termsAcceptedAt: ago(30), termsVersion: "terms:default-v1|refunds:default-v1" });
  await payOrder(IDS.orderConsentOld, "TGFM-5042", TEST_USER.id, { ...consent, termsAcceptedAt: ago(30), termsVersion: "terms:2020-01-01T00:00:00.000Z|refunds:default-v1" });
  await payOrder(IDS.orderConsentNone, "TGFM-5043", TEST_USER.id, { ...consent });
}
