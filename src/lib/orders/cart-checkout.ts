// file: src/lib/orders/cart-checkout.ts
//
// One checkout and one payment for everything in the customer's bag (decision of 8 Nov 2026). The bag on the
// server is the single source of truth: the client never sends prices, items or quantities. Every line is priced
// exactly like a single-build checkout (src/lib/orders/checkout.ts); the totals come from computeCartTotals.
import { createHash, randomBytes } from "node:crypto";
import { PaymentStatus, Prisma, type GarmentColor, type ProductType } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { computePrice, customQuotePriceResult } from "src/pricing/engine";
import { isValidExchangeRate } from "src/pricing/currency";
import { computeCartTotals } from "src/lib/orders/totals";
import { draftPricedPlacements } from "src/lib/orders/draft-placements";
import { PAYABLE_ORDER_STATUS, PAYABLE_PAYMENT_STATUSES } from "src/lib/orders/payable";
import { findSupersedingPaidOrder } from "src/lib/orders/superseded";
import { isPaymobEligible } from "src/lib/bespoke/eligibility";
import { normalizeArtworkPlacement } from "src/lib/artwork/save";
import { buildDesignSignature, type DesignSignature } from "src/lib/orders/reuse";
import { assertApprovedTotal, CheckoutError } from "src/lib/orders/errors";
import { cleanText } from "src/lib/orders/customer";
import { draftArtworkLayers } from "src/studio/artwork-layers";
import { designPreviewUrl, freshMockupPointers } from "src/lib/mockup-preview";
import { productDisplayName } from "src/lib/orders/display";
import { normalizeBagSize } from "src/lib/bag";
import { shippingAddressColumns, validateCheckoutContact } from "src/lib/orders/checkout";

export type CartLine = {
  buildId: string;
  size: string;
  displayName: string;
  thumbnailUrl: string;
  product: string;
  color: string;
  fabric: string;
  quantity: number;
  primaryAssetId: string | null;
  customNotes: string | null;
  placements: ReturnType<typeof draftPricedPlacements>;
  quote: Extract<Awaited<ReturnType<typeof computePrice>>, { mode: "standard" }>;
  lineUsdCents: number;
  layers: ReturnType<typeof draftArtworkLayers>;
  mockups: ReturnType<typeof freshMockupPointers>;
  transform: ReturnType<typeof normalizeArtworkPlacement>;
  savedArtworkId: string | null;
  designSignature: DesignSignature;
};

// Reads the customer's bag and prices every item. Throws CheckoutError (never returns a partial bag).
export async function loadCartLines(userId: string): Promise<CartLine[]> {
  const bagItems = await prisma.bagItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { build: { include: { draft: true } } },
  });
  if (!bagItems.length) throw new CheckoutError("Your bag is empty.", 400);

  const lines: CartLine[] = [];
  for (const item of bagItems) {
    const build = item.build;
    const draft = build?.draft;
    if (!build || !draft || build.userId !== userId) throw new CheckoutError("An item in your bag is no longer available.", 409);
    const { product, fabric, color, quantity, primaryAssetId, customNotes, customQuoteUsdCents } = draft;
    if (!product || !fabric || !color) throw new CheckoutError("Complete the selection of every item in your bag before checkout.", 400);
    if (!isPaymobEligible(product) && customQuoteUsdCents == null) {
      throw new CheckoutError("A bespoke item in your bag is requested as a tailored quote and cannot be paid for here.", 400);
    }
    // Same server-side source as a single-build checkout: the placements of the saved design.
    const placements = draftPricedPlacements(draft);
    const quote =
      product === "CUSTOM" && customQuoteUsdCents != null
        ? customQuotePriceResult(customQuoteUsdCents, quantity, placements)
        : await computePrice({ product, fabric, quantity, placements });
    if (quote.mode !== "standard") throw new CheckoutError(`${productDisplayName(draft)}: ${quote.message}`, 400);

    if (primaryAssetId) {
      const asset = await prisma.asset.findFirst({ where: { id: primaryAssetId, buildId: build.id }, select: { id: true } });
      if (!asset) throw new CheckoutError("The selected artwork of an item in your bag is invalid.", 400);
    }
    const layers = draftArtworkLayers(draft);
    if (layers.length) {
      const ids = [...new Set(layers.map((layer) => layer.assetId))];
      const found = await prisma.asset.count({ where: { id: { in: ids }, buildId: build.id } });
      if (found !== ids.length) throw new CheckoutError("One of the artworks of an item in your bag is invalid.", 400);
    }
    const mockups = freshMockupPointers(draft, layers);
    const size = normalizeBagSize(item.size);
    const transform = normalizeArtworkPlacement(draft.artworkPlacement);
    const designSignature = buildDesignSignature({
      product, fabric, color, quantity, size,
      primaryAssetId: primaryAssetId ?? null,
      placements,
      transform,
      layers,
      savedArtworkId: draft.savedArtworkId ?? null,
      printMockupId: mockups.printMockupId,
      aiMockupId: mockups.aiMockupId,
      backPrintMockupId: mockups.backPrintMockupId,
      backAiMockupId: mockups.backAiMockupId,
    });
    lines.push({
      buildId: build.id, size, displayName: productDisplayName(draft), thumbnailUrl: designPreviewUrl(draft, layers),
      product, color, fabric, quantity, primaryAssetId: primaryAssetId ?? null, customNotes: cleanText(customNotes, 2000) || null,
      placements, quote, lineUsdCents: Math.round(quote.total * 100), layers, mockups, transform,
      savedArtworkId: draft.savedArtworkId ?? null, designSignature,
    });
  }
  return lines;
}

async function loadSettings() {
  const settings = await prisma.storeSetting.findUnique({ where: { id: "store" } }).catch(() => null);
  if (!isValidExchangeRate(settings?.usdToEgpRate)) {
    throw new CheckoutError(
      "Checkout is temporarily unavailable: the store's USD to EGP exchange rate has not been configured. Please try again shortly.",
      503,
    );
  }
  return settings as NonNullable<typeof settings> & { usdToEgpRate: number };
}

// What /api/bag/quote shows on the checkout page: the same lines and the same totals the order will carry.
export async function quoteCart(userId: string) {
  const lines = await loadCartLines(userId);
  const settings = await loadSettings();
  const totals = computeCartTotals({
    lineUsdCents: lines.map((line) => line.lineUsdCents),
    taxRateBps: settings.taxRateBps,
    shippingCents: settings.shippingCents,
    usdToEgpRate: settings.usdToEgpRate,
  });
  return {
    items: lines.map((line, index) => ({
      buildId: line.buildId,
      displayName: line.displayName,
      thumbnailUrl: line.thumbnailUrl,
      product: line.product,
      color: line.color,
      fabric: line.fabric,
      size: line.size,
      quantity: line.quantity,
      linePaymentCents: totals.linePaymentCents[index],
    })),
    totals,
  };
}

// Same bag + same prices + same currency => the same signature; any change to a design, size, quantity or price
// produces a different one, so a stale order can never be reused for a different bag.
export function cartSignature(lines: CartLine[], totalPaymentCents: number, currency: string): string {
  const stable = JSON.stringify({
    currency,
    totalPaymentCents,
    lines: lines.map((line) => [line.buildId, line.designSignature]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  return createHash("sha256").update(stable).digest("hex");
}

export async function createCartCheckoutOrder(
  userId: string,
  input: { customer: { name: string; email: string; phone: string }; shippingAddress?: unknown; expectedTotalCents?: unknown },
) {
  const { customer, address } = validateCheckoutContact(input.customer, input.shippingAddress);
  const shippingColumns = shippingAddressColumns(address);
  const lines = await loadCartLines(userId);
  const settings = await loadSettings();
  const totals = computeCartTotals({
    lineUsdCents: lines.map((line) => line.lineUsdCents),
    taxRateBps: settings.taxRateBps,
    shippingCents: settings.shippingCents,
    usdToEgpRate: settings.usdToEgpRate,
  });
  // The order is created only for the total the customer approved (a changed bag or price => PRICE_CHANGED).
  assertApprovedTotal(input.expectedTotalCents, totals.totalPaymentCents, totals.paymentCurrency);
  const signature = cartSignature(lines, totals.totalPaymentCents, totals.paymentCurrency);
  const orderNumber = `TGFM-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const exchangeRateAt = new Date();

  return prisma.$transaction(async (tx) => {
    // Serialises concurrent submissions of the same bag (double click, two tabs): every build is locked in a fixed
    // order, so two requests can never both pass the "no reusable order yet" check below.
    for (const id of [...new Set(lines.map((line) => line.buildId))].sort()) {
      await tx.$queryRaw`SELECT id FROM "Build" WHERE id = ${id} FOR UPDATE`;
    }

    const open = await tx.order.findMany({
      // Only orders that can still be paid (never cancelled, paid, refunded or already in production).
      where: { userId, status: PAYABLE_ORDER_STATUS, paymentStatus: { in: [...PAYABLE_PAYMENT_STATUSES] } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    const candidate = open.find((order) => (order.items[0]?.preview as { cartSignature?: string } | null)?.cartSignature === signature);
    // A matching open order whose designs were paid on another order in the meantime is stale: make a new one.
    const existing = candidate && !(await findSupersedingPaidOrder(tx, candidate)) ? candidate : null;
    if (existing) {
      return tx.order.update({
        where: { id: existing.id },
        data: { customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone, ...shippingColumns },
        include: { items: true },
      });
    }

    return tx.order.create({
      data: {
        orderNumber,
        userId,
        buildId: lines.length === 1 ? lines[0].buildId : null,
        currency: totals.paymentCurrency,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        ...shippingColumns,
        subtotalCents: totals.subtotalPaymentCents,
        totalCents: totals.totalPaymentCents,
        canonicalTotalUsdCents: totals.totalUsdCents,
        exchangeRateUsed: settings.usdToEgpRate,
        exchangeRateAt,
        paymentStatus: PaymentStatus.PENDING,
        items: {
          create: lines.map((line, index) => ({
            product: line.product as ProductType,
            fabric: line.fabric,
            color: line.color as GarmentColor,
            quantity: line.quantity,
            unitPriceCents: Math.round(line.quote.unit * 100),
            totalCents: line.lineUsdCents,
            placements: line.placements,
            assetId: line.primaryAssetId,
            preview: {
              buildId: line.buildId,
              size: line.size,
              notes: line.customNotes,
              // Order-level tax and shipping live on the first line only, so the lines still sum to the order.
              taxCents: index === 0 ? totals.taxUsdCents : 0,
              shippingCents: index === 0 ? totals.shippingUsdCents : 0,
              baseUnitCents: Math.round(line.quote.baseUnit * 100),
              placementUnitCents: Math.round(line.quote.placementUnit * 100),
              placementTotalCents: Math.round(line.quote.placementTotal * 100),
              designSignature: line.designSignature,
              cart: true,
              ...(index === 0 ? { cartSignature: signature } : {}),
              transform: line.transform,
              savedArtworkId: line.savedArtworkId,
              printMockupId: line.mockups.printMockupId,
              aiMockupId: line.mockups.aiMockupId,
              layers: line.layers,
              backPrintMockupId: line.mockups.backPrintMockupId,
              backAiMockupId: line.mockups.backAiMockupId,
            } as unknown as Prisma.InputJsonValue,
          })),
        },
      },
      include: { items: true },
    });
  }, { maxWait: 8_000, timeout: 8_000 });
}
