// file: src/lib/orders/display.ts
//
// Pure, DB-free helpers for presenting an order's money fields on
// app/admin/orders/[id]/page.tsx. Split out so they're unit-testable with
// this repo's dependency-free test harness (see
// src/lib/orders/__tests__/display.test.ts) -- the page itself is a Server
// Component wired to Prisma/Next.js and can't be unit tested the same way.

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
