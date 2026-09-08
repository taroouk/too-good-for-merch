// file: src/lib/admin/currency-aggregates.ts
//
// Pure, DB-free helpers for summing Order money fields for admin
// dashboards without ever blending currencies together (P1-14). Split out
// so they're unit-testable with this repo's dependency-free test harness
// (see src/lib/admin/__tests__/currency-aggregates.test.ts) -- the admin
// pages themselves are Server Components wired to Prisma and can't be
// unit tested the same way.
//
// Two distinct kinds of "revenue" exist in this app (see
// src/lib/orders/checkout.ts / src/lib/orders/totals.ts):
//   - Canonical reporting: what the store actually SOLD, in USD
//     (Order.canonicalTotalUsdCents). Only populated for orders created
//     under the USD-canonical pricing model -- never backfilled, never
//     guessed for older rows (see src/lib/orders/display.ts's
//     isNewPricingModel).
//   - Payment reporting: what Paymob actually COLLECTED, in whatever
//     currency Order.currency/Order.totalCents holds for that specific
//     order (always EGP going forward, but historical rows are not
//     guaranteed to be).
// Neither may be summed across a mix of currencies and labeled with a
// single currency code -- that produces a number that is not actually
// denominated in anything.

export type CanonicalUsdOrder = { canonicalTotalUsdCents: number | null };

export type CanonicalUsdTotal = {
  revenueUsdCents: number;
  // Paid orders predating canonicalTotalUsdCents -- their USD value was
  // never recorded, so they're excluded from revenueUsdCents rather than
  // silently converted using today's exchange rate. Surface this count so
  // the UI can say so instead of quietly under-reporting revenue.
  excludedLegacyCount: number;
};

export function sumCanonicalUsd(orders: readonly CanonicalUsdOrder[]): CanonicalUsdTotal {
  let revenueUsdCents = 0;
  let excludedLegacyCount = 0;
  for (const order of orders) {
    if (order.canonicalTotalUsdCents != null) {
      revenueUsdCents += order.canonicalTotalUsdCents;
    } else {
      excludedLegacyCount += 1;
    }
  }
  return { revenueUsdCents, excludedLegacyCount };
}

export type MoneyOrder = { totalCents: number; currency: string };

export type CurrencyTotal = { currency: string; totalCents: number; count: number };

// Groups by the order's ACTUAL charged currency and sums within each group
// only -- never across groups. Sorted by currency for a stable display
// order (largest bucket first is tempting but would make the primary
// currency's position jump around as data changes).
export function sumByCurrency(orders: readonly MoneyOrder[]): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();
  for (const order of orders) {
    const existing = byCurrency.get(order.currency);
    if (existing) {
      existing.totalCents += order.totalCents;
      existing.count += 1;
    } else {
      byCurrency.set(order.currency, { currency: order.currency, totalCents: order.totalCents, count: 1 });
    }
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

// Convenience for the common case (one dominant payment currency, e.g.
// "EGP"): the total actually collected in that currency, plus how many
// paid orders were denominated in something else and therefore excluded
// from it (never silently converted).
export function sumInCurrency(orders: readonly MoneyOrder[], currency: string): { totalCents: number; otherCurrencyCount: number } {
  const totals = sumByCurrency(orders);
  return pickCurrencyTotal(totals, currency);
}

// P2-11: identical result shape/semantics to sumInCurrency, but starting
// from rows that are already grouped-and-summed BY THE DATABASE (e.g. via
// prisma.order.groupBy({ by: ["currency"], _sum: { totalCents: true },
// _count: true })), rather than fetching every matching order row into
// memory and summing in JS. Callers with an unbounded number of
// paid/refunded orders should use this with a groupBy query instead of
// sumInCurrency + findMany. Split out so both paths share the exact same
// "pick the target currency, count everything else" logic instead of
// duplicating it.
export function pickCurrencyTotal(totals: readonly CurrencyTotal[], currency: string): { totalCents: number; otherCurrencyCount: number } {
  const match = totals.find((t) => t.currency === currency);
  const otherCurrencyCount = totals.filter((t) => t.currency !== currency).reduce((sum, t) => sum + t.count, 0);
  return { totalCents: match?.totalCents ?? 0, otherCurrencyCount };
}
