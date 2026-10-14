// Pure helpers for "My bag" (no DB) so they can be unit tested.
export const BAG_SIZES = ["S", "M", "L", "XL"] as const;
export type BagSize = (typeof BAG_SIZES)[number];

// Same rule as src/lib/orders/checkout.ts: anything unknown becomes "M".
export function normalizeBagSize(value: unknown): BagSize {
  return (BAG_SIZES as readonly string[]).includes(String(value)) ? (String(value) as BagSize) : "M";
}

export function checkoutHref(buildId: string, size: string): string {
  return `/checkout?buildId=${encodeURIComponent(buildId)}&size=${encodeURIComponent(normalizeBagSize(size))}`;
}

export const MAX_BAG_ITEMS = 50;
