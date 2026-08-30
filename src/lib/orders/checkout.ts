import { randomBytes } from "node:crypto";
import { FabricType, GarmentColor, PaymentStatus, Prisma, ProductType } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { computePrice, customQuotePriceResult } from "src/pricing/engine";
import { convertUsdCentsToPaymentCents, isValidExchangeRate } from "src/pricing/currency";
import {
  placementsFromCustomNotes,
  placementsOrDefault,
  normalizePlacements,
} from "src/pricing/placements";
import { canAccessBuild } from "src/studio/permissions";
import { cleanText, validateCustomer, CustomerValidationError } from "src/lib/orders/customer";
import { isPaymobEligible } from "src/lib/bespoke/eligibility";

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

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

  // Canonical pricing, entirely in USD -- same tax/shipping arithmetic as
  // before the currency split, just named explicitly (*UsdCents) so it can
  // never be mistaken for a payment-currency amount below.
  const settings = await prisma.storeSetting.findUnique({ where: { id: "store" } }).catch(() => null);
  const subtotalUsdCents = Math.round(quote.total * 100);
  const taxUsdCents = Math.round(subtotalUsdCents * ((settings?.taxRateBps ?? 0) / 10_000));
  const shippingUsdCents = Math.max(0, settings?.shippingCents ?? 0);
  const canonicalTotalUsdCents = subtotalUsdCents + taxUsdCents + shippingUsdCents;

  // Paymob's current merchant integration only accepts EGP -- convert the
  // canonical USD amounts to the payment currency exactly once each
  // (subtotal and total are each one multiplication by the same rate; tax,
  // shipping, placements, and line items are never converted independently
  // -- see the OrderItem block below, which stays USD on purpose). The rate
  // is admin-controlled (StoreSetting.usdToEgpRate) and frozen onto the
  // order below so a later rate change can never alter an order already
  // placed. Fails closed: checkout must never guess, default, or silently
  // continue with an unset/invalid rate.
  const usdToEgpRate = settings?.usdToEgpRate;
  if (!isValidExchangeRate(usdToEgpRate)) {
    throw new CheckoutError(
      "Checkout is temporarily unavailable: the store's USD to EGP exchange rate has not been configured. Please try again shortly.",
      503,
    );
  }
  // Paired 1:1 with usdToEgpRate above -- not derived from
  // src/pricing/engine.ts's resolveCurrentCurrency()/paymentCurrency()
  // (a StoreSetting.currency edit unrelated to this rate) on purpose, so
  // this constant can never silently diverge from what the rate actually
  // converts to. A future USD-Paymob integration would need its own rate
  // field and its own branch here, not a reuse of this one.
  const paymentCurrency = "EGP" as const;
  const subtotalPaymentCents = convertUsdCentsToPaymentCents(subtotalUsdCents, usdToEgpRate);
  const totalPaymentCents = convertUsdCentsToPaymentCents(canonicalTotalUsdCents, usdToEgpRate);
  const exchangeRateAt = new Date();

  const orderNumber = `TGFM-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

  return prisma.$transaction(async (tx) => {
    // Serializes concurrent checkout submissions for the same build (double
    // click, two tabs, a network retry): without this lock, two
    // near-simultaneous requests can both pass the "no reusable order yet"
    // check below before either commits, each creating its own Order and
    // its own live Paymob payment link. Safe under this project's pooled
    // (pgbouncer=true) connection since the lock and every statement that
    // depends on it live inside this one transaction. The generous
    // maxWait/timeout below (vs Prisma's 2s/5s defaults) covers a second
    // request genuinely waiting out the first's full transaction under
    // real network latency to the database, not just the lock itself.
    await tx.$queryRaw`SELECT id FROM "Build" WHERE id = ${buildId} FOR UPDATE`;

    if (!build.userId) await tx.build.update({ where: { id: buildId }, data: { userId } });

    // Reuse an existing non-terminal order for this exact build instead of
    // accumulating a fresh one every time checkout is (re)submitted from
    // the product page - retrying from the order status page already
    // reuses via orderId (see /api/payments/paymob/create-intent), but a
    // customer who navigates back to the product and checks out again
    // previously always got a brand new Order, even for an identical,
    // still-failed attempt. Only reused when price/currency still match
    // current settings - otherwise falls through to creating a fresh order,
    // same as a currency correction invalidating a stale retry.
    const existing = await tx.order.findFirst({
      where: { buildId, userId, paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing && existing.currency === paymentCurrency && existing.totalCents === totalPaymentCents) {
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
            } as Prisma.InputJsonValue,
            assetId: primaryAssetId,
          },
        },
      },
      include: { items: true },
    });
  }, { maxWait: 10_000, timeout: 15_000 });
}
