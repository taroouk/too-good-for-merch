// Pure product-routing rules shared by the paid checkout
// (src/lib/orders/checkout.ts) and the Bespoke request intake
// (src/actions/bespoke-actions.ts). The single place that decides which
// products may enter the Paymob payment path and which are bespoke-only.
// Unit-tested in src/lib/bespoke/__tests__/eligibility.test.ts.

// A string rather than the Prisma enum type so this module stays free of
// any @prisma/client import and remains compilable by the pure test
// runner (scripts/payments-test.tsconfig.json).
export type ProductLike = "FITTED" | "OVERSIZED" | "CUSTOM" | string | null | undefined;

export const BESPOKE_PRODUCT = "CUSTOM" as const;

export class BespokeRoutingError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "BespokeRoutingError";
  }
}

// CUSTOM/Bespoke work is quoted by a human and never charged automatically
// -- it must never reach createCheckoutOrder / Paymob as a fresh checkout.
// (The separate admin-quoted "pay later" path is a deliberate, explicit
// re-entry and is gated by BuildDraft.customQuoteUsdCents, not by this.)
export function isBespokeProduct(product: ProductLike): boolean {
  return product === BESPOKE_PRODUCT;
}

export function isPaymobEligible(product: ProductLike): boolean {
  return product === "FITTED" || product === "OVERSIZED";
}

// Throws when a normal product is pushed through the bespoke intake.
export function assertBespokeOnly(product: ProductLike): void {
  if (!isBespokeProduct(product)) {
    throw new BespokeRoutingError(
      "Only bespoke (custom) builds can be submitted as a request. Standard products check out normally.",
    );
  }
}
