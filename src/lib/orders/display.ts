// file: src/lib/orders/display.ts
//
// Pure, DB-free helpers for presenting an order's money fields on
// app/admin/orders/[id]/page.tsx. Split out so they're unit-testable with
// this repo's dependency-free test harness (see
// src/lib/orders/__tests__/display.test.ts) -- the page itself is a Server
// Component wired to Prisma/Next.js and can't be unit tested the same way.

// Relative, not "src/..." -- scripts/payments-test.tsconfig.json compiles
// this module without the app's path aliases.
import { PAYMENT_CURRENCY } from "./totals";

// The one non-guessing signal for "was this order priced under the
// USD-canonical checkout model" (see src/lib/orders/checkout.ts): that code
// populates canonicalTotalUsdCents (with exchangeRateUsed/exchangeRateAt)
// together, and never backfills historical rows. Never infer this any
// other way (e.g. from order.currency or a date range).
export function isNewPricingModel(order: { canonicalTotalUsdCents: number | null }): boolean {
  return order.canonicalTotalUsdCents != null;
}

// OrderItem.unitPriceCents/totalCents are canonical USD only for orders on
// the new pricing model -- for anything older they were computed in
// whatever currency order.currency held at creation time (there was no
// USD/payment split yet), so this must fall back to order.currency, never
// assume USD across the board.
export function itemDisplayCurrency(order: { canonicalTotalUsdCents: number | null; currency: string }): string {
  return isNewPricingModel(order) ? "USD" : order.currency;
}

// Rounds a stored exchange rate to a stable display precision without
// introducing trailing-zero noise (50 -> "50", not "50.0000").
export function formatExchangeRate(rate: number): number {
  return Number(rate.toFixed(4));
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

// P3-21d: the admin pricing card used to render "Subtotal" and a literal
// "Shipping: TBC" above a "Total", so whenever tax or shipping was non-zero
// the visible arithmetic simply did not add up and there was no way to tell
// where the gap came from. Order stores only subtotalCents/totalCents in the
// payment currency, so the exact payment-currency surcharge is their
// difference -- derived here rather than left implicit, and guaranteed to
// reconcile: subtotal + surcharge === total, by construction.
export type OrderPaymentBreakdown = {
  subtotalCents: number;
  surchargeCents: number;
  totalCents: number;
};

export function orderPaymentBreakdown(order: {
  subtotalCents: number;
  totalCents: number;
}): OrderPaymentBreakdown {
  return {
    subtotalCents: order.subtotalCents,
    surchargeCents: order.totalCents - order.subtotalCents,
    totalCents: order.totalCents,
  };
}

// The canonical USD tax/shipping figures frozen onto OrderItem.preview at
// checkout (see src/lib/orders/checkout.ts). Reported separately from the
// payment-currency breakdown above and never summed into it -- USD and the
// payment currency must not be blended (P1-14). Returns null for either
// component that was not recorded, so legacy orders degrade to "unknown"
// rather than to a fabricated zero.
export type OrderUsdSurcharges = {
  taxUsdCents: number | null;
  shippingUsdCents: number | null;
};

export function orderUsdSurcharges(itemPreview: unknown): OrderUsdSurcharges {
  const preview =
    itemPreview && typeof itemPreview === "object" ? (itemPreview as Record<string, unknown>) : null;
  const read = (key: string): number | null => {
    const value = preview?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  return { taxUsdCents: read("taxCents"), shippingUsdCents: read("shippingCents") };
}

// P3-21e: the admin order-list "Min total"/"Max total" filters compare
// against Order.totalCents, which is the PAYMENT amount (EGP), not the
// canonical USD figure shown elsewhere on the same screens. Unlabelled, an
// admin thinking in USD silently gets results off by the exchange rate
// (~50x). The unit comes from PAYMENT_CURRENCY -- the same constant
// createCheckoutOrder writes onto the order -- so the label can never drift
// from the column being filtered.
export function orderTotalFilterLabel(bound: "Min" | "Max"): string {
  return `${bound} total (${PAYMENT_CURRENCY})`;
}

export const ORDER_TOTAL_FILTER_HINT =
  `Amount filters match the ${PAYMENT_CURRENCY} payment total, not the canonical USD total.`;

export type OrderMockupIds = { printMockupId: string | null; aiMockupId: string | null };

// P1-8: Mockup rows are append-only (src/db/mockup.ts always creates a new
// row and only reassigns the BuildDraft.printMockupId/aiMockupId pointer),
// so a purchase-time pointer frozen onto OrderItem.preview (see
// src/lib/orders/checkout.ts) stays valid forever even if the customer
// keeps editing the same Build after paying. Prefer that frozen snapshot;
// fall back to the live BuildDraft pointer only for orders placed before
// this snapshot existed.
export function resolveOrderMockupIds(
  itemPreview: unknown,
  liveDraft: { printMockupId: string | null; aiMockupId: string | null } | null | undefined,
): OrderMockupIds {
  const preview = itemPreview && typeof itemPreview === "object" ? (itemPreview as Record<string, unknown>) : null;
  const snapshotPrintMockupId = typeof preview?.printMockupId === "string" ? preview.printMockupId : null;
  const snapshotAiMockupId = typeof preview?.aiMockupId === "string" ? preview.aiMockupId : null;

  return {
    printMockupId: snapshotPrintMockupId ?? liveDraft?.printMockupId ?? null,
    aiMockupId: snapshotAiMockupId ?? liveDraft?.aiMockupId ?? null,
  };
}
