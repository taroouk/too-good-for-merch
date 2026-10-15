import { prisma } from "src/lib/prisma";
import { placementsOrDefault, type PlacementKey } from "src/pricing/placements";
import { FALLBACK_PRICES, RANGES } from "src/pricing/defaults";

export type PriceResult =
  | {
      mode: "standard";
      unit: number;
      total: number;
      currency: string;
      baseUnit: number;
      placementUnit: number;
      placementTotal: number;
      placements: PlacementKey[];
    }
  | {
      mode: "custom" | "bulk";
      unit: null;
      total: null;
      currency: string;
      message: string;
    };

// The one and only pricing currency. Every PricingRule/PlacementPricingRule
// row and every FALLBACK_PRICES number above is denominated in USD, always
// -- fixed, not derived from StoreSetting/env, and never reinterpreted as a
// different currency just because the store's payment currency changes.
// This is the direct fix for a bug where flipping the payment-currency
// default silently relabeled unconverted USD numbers as EGP (see
// src/lib/orders/checkout.ts for the explicit USD -> payment-currency
// conversion step, which reads this value but never writes back to it).
export const PRICING_CURRENCY = "USD" as const;

// Resolves the *payment* currency (what Paymob actually charges), which is
// intentionally a separate concept from PRICING_CURRENCY above. Paymob
// merchant integrations are provisioned for a specific currency (for this
// project's Egypt-based Paymob integration, that's EGP) - sending an
// unsupported currency gets rejected with "Invalid currency sent" at the
// payment_keys step. EGP is the correct default here; override via the
// StoreSetting admin page or STORE_CURRENCY if this account is different.
// computePrice() below does not call this -- pricing currency is fixed,
// only payment currency is configurable.
function paymentCurrency() {
  const value = (process.env.STORE_CURRENCY ?? "EGP").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : "EGP";
}

// Mirrors the payment-currency resolution src/lib/orders/checkout.ts's
// createCheckoutOrder uses when converting a priced order for payment
// (StoreSetting row wins, falling back to the same paymentCurrency()
// default). Exposed so callers can detect when an *existing* order's
// stored payment currency has gone stale relative to current settings
// (e.g. after fixing STORE_CURRENCY) without needing a full computePrice()
// call, which requires product/fabric/quantity that a pure payment retry
// may not have on hand. This is about payment currency, not pricing
// currency -- see PRICING_CURRENCY above.
export async function resolveCurrentCurrency(): Promise<string> {
  const settings = await prisma.storeSetting.findUnique({ where: { id: "store" } }).catch(() => null);
  return settings?.currency ?? paymentCurrency();
}

export async function computePrice({
  product,
  fabric,
  quantity,
  placements,
}: {
  product: string | null;
  fabric: string | null;
  quantity: number;
  placements?: unknown;
}): Promise<PriceResult> {
  const currency = PRICING_CURRENCY;
  const qty = Math.max(1, Math.min(500, Math.floor(Number(quantity) || 1)));
  const normalizedPlacements = placementsOrDefault(placements);

  if (product === "CUSTOM") {
    return { mode: "custom", unit: null, total: null, currency, message: "Custom garments require a tailored quote." };
  }
  if (quantity >= 501) {
    return { mode: "bulk", unit: null, total: null, currency, message: "We will contact you for pricing" };
  }
  if (!product || !fabric) {
    return { mode: "custom", unit: null, total: null, currency, message: "Select product and fabric" };
  }

  // unitPrice here is USD (PRICING_CURRENCY) -- the column carries no
  // currency of its own, so this is enforced by convention, not the schema.
  // Run alongside placementRules below: neither query depends on the
  // other's result, so there's no reason to pay two sequential round trips.
  const [rule, placementRules, paused, fabricRow] = await Promise.all([
    prisma.pricingRule.findFirst({
      where: { product, fabric, minQty: { lte: qty }, maxQty: { gte: qty } },
      orderBy: { minQty: "desc" },
    }).catch(() => null),
    // unitPrice here is also USD, same convention as PricingRule above.
    prisma.placementPricingRule
      .findMany({
        where: { placement: { in: normalizedPlacements } },
        select: { placement: true, unitPrice: true },
      })
      .catch(() => []),
    // Admin "pause selling" switch (see CatalogPause in schema.prisma). A
    // failed lookup fails OPEN (not paused) so a transient DB error here
    // can't silently stop every sale -- the other lookups above already
    // degrade the same way.
    prisma.catalogPause
      .findUnique({ where: { product_fabric: { product, fabric } }, select: { reason: true } })
      .catch(() => null),
    // A fabric an admin deactivated in the catalog can't be bought either.
    // Unknown keys (legacy rows) and lookup failures fail open.
    prisma.catalogFabric.findUnique({ where: { key: fabric }, select: { active: true } }).catch(() => null),
  ]);

  if (fabricRow && !fabricRow.active) {
    return { mode: "custom", unit: null, total: null, currency, message: "This fabric is no longer available" };
  }

  if (paused) {
    return { mode: "custom", unit: null, total: null, currency, message: paused.reason?.trim() || "This option is temporarily unavailable" };
  }

  const rangeIndex = RANGES.findIndex(([min, max]) => qty >= min && qty <= max);
  const baseUnit = rule?.unitPrice ?? FALLBACK_PRICES[product]?.[fabric]?.[rangeIndex];

  if (!baseUnit || !Number.isFinite(baseUnit) || baseUnit <= 0) {
    return { mode: "custom", unit: null, total: null, currency, message: "No pricing found" };
  }
  const placementUnit = placementRules.reduce((total, rule) => {
    return total + (Number.isFinite(rule.unitPrice) && rule.unitPrice > 0 ? rule.unitPrice : 0);
  }, 0);
  const unit = baseUnit + placementUnit;

  return {
    mode: "standard",
    unit: Number(unit.toFixed(2)),
    total: Number((unit * qty).toFixed(2)),
    currency,
    baseUnit: Number(baseUnit.toFixed(2)),
    placementUnit: Number(placementUnit.toFixed(2)),
    placementTotal: Number((placementUnit * qty).toFixed(2)),
    placements: normalizedPlacements,
  };
}

// The one and only path a Bespoke/Custom (product === "CUSTOM") build ever
// gets a real price: computePrice() above always returns mode:"custom" for
// it, by design -- custom work needs a human quote, not a catalog rule.
// Once an admin sets one (BuildDraft.customQuoteUsdCents, see
// src/actions/admin-bespoke-actions.ts), callers that know about it build
// this in place of calling computePrice, so every downstream consumer
// (the /checkout page, createCheckoutOrder) needs zero special-casing
// beyond "is this a quote-based result" -- shaped identically to a real
// computePrice() standard result. unit is derived (total / quantity) purely
// for display parity with the standard case; the quote itself is a total,
// not a rate, since a one-off bespoke price rarely divides cleanly.
export function customQuotePriceResult(
  quoteUsdCents: number,
  quantity: number,
  placements: PlacementKey[],
): PriceResult {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const total = quoteUsdCents / 100;
  const unit = total / qty;

  return {
    mode: "standard",
    unit: Number(unit.toFixed(2)),
    total: Number(total.toFixed(2)),
    currency: PRICING_CURRENCY,
    baseUnit: Number(unit.toFixed(2)),
    placementUnit: 0,
    placementTotal: 0,
    placements,
  };
}
