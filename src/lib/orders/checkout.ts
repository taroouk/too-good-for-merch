import { randomBytes } from "node:crypto";
import { FabricType, GarmentColor, PaymentStatus, Prisma, ProductType } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { computePrice, customQuotePriceResult } from "src/pricing/engine";
import { isValidExchangeRate } from "src/pricing/currency";
import { computeOrderTotals } from "src/lib/orders/totals";
import {
  placementsFromCustomNotes,
  placementsOrDefault,
  normalizePlacements,
} from "src/pricing/placements";
import { canAccessBuild } from "src/studio/permissions";
import { cleanText, validateCustomer, CustomerValidationError } from "src/lib/orders/customer";
import { isPaymobEligible } from "src/lib/bespoke/eligibility";
import { normalizeArtworkPlacement } from "src/lib/artwork/save";
import { buildDesignSignature, canReuseOrder, type DesignSignature } from "src/lib/orders/reuse";
import { CheckoutError } from "src/lib/orders/errors";

export { CheckoutError } from "src/lib/orders/errors";

export type CheckoutInput = {
  buildId: string;
  customer: { name: string; email: string; phone: string };
  placements?: unknown;
  size?: unknown;
};

export async function createCheckoutOrder(userId: string, input: CheckoutInput) {
  const buildId = cleanText(input?.buildId, 128);
  if (!buildId) throw new CheckoutError("A build is required.");
  let customer;
  try {
    customer = validateCustomer(input.customer);
  } catch (error) {
    if (error instanceof CustomerValidationError) throw new CheckoutError(error.message, 400);
    throw error;
  }

  const build = await prisma.build.findUnique({
    where: { id: buildId },
    include: { draft: true },
  });
  if (!build?.draft) throw new CheckoutError("Build not found.", 404);
  if (!(await canAccessBuild(userId, build))) {
    throw new CheckoutError("You cannot checkout this build.", 403);
  }

  const { product, fabric, color, quantity, primaryAssetId, customNotes, customQuoteUsdCents } = build.draft;
  if (!product || !fabric || !color) throw new CheckoutError("Complete the product selection before checkout.");

  // Explicit guard: a Bespoke/Custom build must be submitted through the
  // no-payment request intake (src/actions/bespoke-actions.ts), not paid
  // directly. The one sanctioned exception is the admin-quoted "pay later"
  // path -- gated on customQuoteUsdCents, which an admin sets only after
  // pricing the request by hand (see src/actions/admin-bespoke-actions.ts).
  if (!isPaymobEligible(product) && customQuoteUsdCents == null) {
    throw new CheckoutError(
      "Bespoke builds are submitted as a request for a tailored quote, not paid directly.",
      400,
    );
  }

  const requestedPlacements = normalizePlacements(input.placements);
  const draftPlacements = placementsFromCustomNotes(customNotes);
  const safePlacements = placementsOrDefault(
    requestedPlacements.length ? requestedPlacements : draftPlacements,
  );

  // Bespoke/Custom builds never get a computePrice() result (always
  // mode:"custom" by design -- see src/pricing/engine.ts). An admin-set
  // quote is the only way one becomes checkout-eligible; everything else
  // (FITTED/OVERSIZED) is priced exactly as before.
  const quote =
    product === "CUSTOM" && customQuoteUsdCents != null
      ? customQuotePriceResult(customQuoteUsdCents, quantity, safePlacements)
      : await computePrice({ product, fabric, quantity, placements: safePlacements });
  if (quote.mode !== "standard") throw new CheckoutError(quote.message);
  // quote.currency is always PRICING_CURRENCY ("USD") -- see src/pricing/engine.ts.

  if (primaryAssetId) {
    const asset = await prisma.asset.findFirst({ where: { id: primaryAssetId, buildId }, select: { id: true } });
    if (!asset) throw new CheckoutError("The selected artwork is invalid.");
  }

  const size = ["S", "M", "L", "XL"].includes(String(input.size)) ? String(input.size) : "M";
  const transform = normalizeArtworkPlacement(build.draft.artworkPlacement);
  const designSignature: DesignSignature = buildDesignSignature({
    product,
    fabric,
    color,
    quantity,
    size,
    primaryAssetId: primaryAssetId ?? null,
    placements: safePlacements,
    transform,
  });

  // Canonical pricing is entirely in USD; the conversion to the payment
  // currency happens inside computeOrderTotals. That arithmetic lives in
  // src/lib/orders/totals.ts rather than here because /api/build/[id] has
  // to quote the identical figures to the checkout page before this
  // function ever runs -- two copies of it would let the price a customer
  // agreed to drift from the price Paymob charges.
  const settings = await prisma.storeSetting.findUnique({ where: { id: "store" } }).catch(() => null);

  // The rate is admin-controlled (StoreSetting.usdToEgpRate) and frozen
  // onto the order below, so a later rate change can never alter an order
  // already placed. Fails closed: checkout must never guess, default, or
  // silently continue with an unset/invalid rate.
  const usdToEgpRate = settings?.usdToEgpRate;
  if (!isValidExchangeRate(usdToEgpRate)) {
    throw new CheckoutError(
      "Checkout is temporarily unavailable: the store's USD to EGP exchange rate has not been configured. Please try again shortly.",
      503,
    );
  }

  const totals = computeOrderTotals({
    subtotalUsdCents: Math.round(quote.total * 100),
    taxRateBps: settings?.taxRateBps,
    shippingCents: settings?.shippingCents,
    usdToEgpRate,
  });
  const {
    subtotalUsdCents,
    taxUsdCents,
    shippingUsdCents,
    totalUsdCents: canonicalTotalUsdCents,
    paymentCurrency,
    subtotalPaymentCents,
    totalPaymentCents,
  } = totals;
  const exchangeRateAt = new Date();

  const orderNumber = `TGFM-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

  return prisma.$transaction(async (tx) => {
    // Serializes concurrent checkout submissions for the same build (double
    // click, two tabs, a network retry): without this lock, two
    // near-simultaneous requests can both pass the "no reusable order yet"
    // check below before either commits, each creating its own Order and
    // its own live Paymob payment link. Safe under this project's pooled
    // (pgbouncer=true) connection since the lock and every statement that
    // depends on it live inside this one transaction. maxWait/timeout below
    // are equal (vs Prisma's 2s/5s defaults) so a second request waiting on
    // the lock can wait out the full duration the first transaction is
    // itself allowed to run -- and both are kept short since this route sits
    // in the create-intent request's overall serverless duration budget
    // (see app/api/payments/paymob/create-intent/route.ts).
    await tx.$queryRaw`SELECT id FROM "Build" WHERE id = ${buildId} FOR UPDATE`;

    if (!build.userId) await tx.build.update({ where: { id: buildId }, data: { userId } });

    // Reuse an existing non-terminal order for this exact build instead of
    // accumulating a fresh one every time checkout is (re)submitted from
    // the product page - retrying from the order status page already
    // reuses via orderId (see /api/payments/paymob/create-intent), but a
    // customer who navigates back to the product and checks out again
    // previously always got a brand new Order, even for an identical,
    // still-failed attempt. Reuse requires BOTH price/currency to still
    // match current settings AND the design signature (product, fabric,
    // color, quantity, size, primary artwork, placements, exact
    // x/y/scale/rotation transform) to be byte-identical to what this
    // order already represents -- see src/lib/orders/reuse.ts. Artwork or
    // color can change without changing price, so price-only matching
    // could otherwise let a charge silently go through for a different
    // design than the Order record shows. Any mismatch falls through to
    // creating a fresh order, same as a currency correction invalidating a
    // stale retry.
    const existing = await tx.order.findFirst({
      where: { buildId, userId, paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    const existingSignature =
      (existing?.items[0]?.preview as { designSignature?: DesignSignature } | null)?.designSignature ?? null;
    const reusable = canReuseOrder({
      existing: existing
        ? { currency: existing.currency, totalCents: existing.totalCents, existingSignature }
        : null,
      candidate: { currency: paymentCurrency, totalCents: totalPaymentCents, signature: designSignature },
    });
    if (existing && reusable) {
      return tx.order.update({
        where: { id: existing.id },
        data: { customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone },
        include: { items: true },
      });
    }

    return tx.order.create({
      data: {
        orderNumber,
        userId,
        buildId,
        currency: paymentCurrency,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        subtotalCents: subtotalPaymentCents,
        totalCents: totalPaymentCents,
        canonicalTotalUsdCents,
        exchangeRateUsed: usdToEgpRate,
        exchangeRateAt,
        paymentStatus: PaymentStatus.PENDING,
        items: {
          create: {
            product: product as ProductType,
            fabric: fabric as FabricType,
            color: color as GarmentColor,
            quantity,
            // OrderItem stays canonical USD on purpose -- pricing is USD
            // everywhere except Order.totalCents/currency (the actual
            // payment amount/currency, converted above).
            unitPriceCents: Math.round(quote.unit * 100),
            totalCents: subtotalUsdCents,
            placements: safePlacements,
            preview: {
              size,
              notes: cleanText(build.draft?.customNotes, 2000),
              taxCents: taxUsdCents,
              shippingCents: shippingUsdCents,
              baseUnitCents: Math.round(quote.baseUnit * 100),
              placementUnitCents: Math.round(quote.placementUnit * 100),
              placementTotalCents: Math.round(quote.placementTotal * 100),
              // Exact purchased-design fingerprint (P1-7/P1-8): used both
              // to gate order reuse above and, together with `transform`
              // below, to let fulfillment/rendering reconstruct precisely
              // what was paid for even if BuildDraft is edited afterwards.
              designSignature,
              transform,
              // P1-8: freeze whichever mockups were live on the Build at
              // purchase time. Mockup rows are append-only (src/db/mockup.ts
              // always creates a new row and only reassigns these pointers
              // on BuildDraft), so this snapshot stays valid even if the
              // customer keeps generating new mockups on the same Build
              // after paying. See resolveOrderMockupIds in
              // src/lib/orders/display.ts for how this is consumed.
              printMockupId: build.draft?.printMockupId ?? null,
              aiMockupId: build.draft?.aiMockupId ?? null,
            } as unknown as Prisma.InputJsonValue,
            assetId: primaryAssetId,
          },
        },
      },
      include: { items: true },
    });
  }, { maxWait: 8_000, timeout: 8_000 });
}
