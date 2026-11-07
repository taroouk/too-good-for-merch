// file: src/lib/orders/totals.ts
//
// The single arithmetic definition of "what does this order actually cost",
// from a priced subtotal through tax, shipping, and the USD -> payment
// currency conversion. Shared by createCheckoutOrder (which writes these
// numbers onto the Order) and /api/build/[id] (which quotes them to the
// checkout page beforehand), so the amount a customer is shown and the
// amount Paymob charges come from the same expression rather than two
// copies that can drift. Pure and DB-free so it's unit-testable with this
// repo's dependency-free harness; callers supply the StoreSetting values.

// Relative, not "src/..." -- scripts/payments-test.tsconfig.json compiles
// this module without the app's path aliases.
import { convertUsdCentsToPaymentCents } from "../../pricing/currency";

// Paymob's merchant integration for this store is provisioned for EGP; see
// the longer note in src/lib/orders/checkout.ts. A future USD integration
// needs its own rate and its own branch, not a reuse of this constant.
export const PAYMENT_CURRENCY = "EGP" as const;

export type OrderTotals = {
  subtotalUsdCents: number;
  taxUsdCents: number;
  shippingUsdCents: number;
  totalUsdCents: number;
  paymentCurrency: typeof PAYMENT_CURRENCY;
  subtotalPaymentCents: number;
  totalPaymentCents: number;
  exchangeRate: number;
};

export function computeOrderTotals(params: {
  subtotalUsdCents: number;
  taxRateBps: number | null | undefined;
  shippingCents: number | null | undefined;
  usdToEgpRate: number;
}): OrderTotals {
  // One rounding model for every checkout: a single item is a bag of one line (see computeCartTotals below), so
  // Buy Now, the bag and the Studio price can never disagree. (Until 9 Nov 2026 this converted subtotal+tax+shipping
  // in one go, which differed from the bag by up to one pound whenever tax or shipping was configured.)
  const cart = computeCartTotals({
    lineUsdCents: [params.subtotalUsdCents],
    taxRateBps: params.taxRateBps,
    shippingCents: params.shippingCents,
    usdToEgpRate: params.usdToEgpRate,
  });
  return {
    subtotalUsdCents: cart.subtotalUsdCents,
    taxUsdCents: cart.taxUsdCents,
    shippingUsdCents: cart.shippingUsdCents,
    totalUsdCents: cart.totalUsdCents,
    paymentCurrency: PAYMENT_CURRENCY,
    subtotalPaymentCents: cart.subtotalPaymentCents,
    totalPaymentCents: cart.totalPaymentCents,
    exchangeRate: params.usdToEgpRate,
  };
}

export type CartTotals = {
  lineUsdCents: number[];
  linePaymentCents: number[];
  subtotalUsdCents: number;
  taxUsdCents: number;
  shippingUsdCents: number;
  totalUsdCents: number;
  paymentCurrency: typeof PAYMENT_CURRENCY;
  subtotalPaymentCents: number;
  totalPaymentCents: number;
  exchangeRate: number;
};

// One payment for a whole bag. Each line is converted to whole pounds on its own, and the payment subtotal is
// the SUM of those displayed lines, so the figures a customer sees always add up to what Paymob charges.
// Tax (on the summed USD subtotal) and shipping (once per order, not per item) are converted once together.
// For a bag of one item with no tax/shipping this equals computeOrderTotals().
export function computeCartTotals(params: {
  lineUsdCents: number[];
  taxRateBps: number | null | undefined;
  shippingCents: number | null | undefined;
  usdToEgpRate: number;
}): CartTotals {
  const { lineUsdCents, usdToEgpRate } = params;
  const subtotalUsdCents = lineUsdCents.reduce((sum, cents) => sum + cents, 0);
  const taxUsdCents = Math.round(subtotalUsdCents * ((params.taxRateBps ?? 0) / 10_000));
  const shippingUsdCents = Math.max(0, params.shippingCents ?? 0);
  const linePaymentCents = lineUsdCents.map((cents) => convertUsdCentsToPaymentCents(cents, usdToEgpRate));
  const subtotalPaymentCents = linePaymentCents.reduce((sum, cents) => sum + cents, 0);
  const feesPaymentCents = convertUsdCentsToPaymentCents(taxUsdCents + shippingUsdCents, usdToEgpRate);
  return {
    lineUsdCents,
    linePaymentCents,
    subtotalUsdCents,
    taxUsdCents,
    shippingUsdCents,
    totalUsdCents: subtotalUsdCents + taxUsdCents + shippingUsdCents,
    paymentCurrency: PAYMENT_CURRENCY,
    subtotalPaymentCents,
    totalPaymentCents: subtotalPaymentCents + feesPaymentCents,
    exchangeRate: usdToEgpRate,
  };
}
