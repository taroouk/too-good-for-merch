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
  const { subtotalUsdCents, usdToEgpRate } = params;
  const taxUsdCents = Math.round(subtotalUsdCents * ((params.taxRateBps ?? 0) / 10_000));
  const shippingUsdCents = Math.max(0, params.shippingCents ?? 0);
  const totalUsdCents = subtotalUsdCents + taxUsdCents + shippingUsdCents;

  return {
    subtotalUsdCents,
    taxUsdCents,
    shippingUsdCents,
    totalUsdCents,
    paymentCurrency: PAYMENT_CURRENCY,
    // Subtotal and total are each converted exactly once, from their own
    // canonical USD figure. Tax and shipping are deliberately NOT converted
    // individually -- rounding each component and summing the roundings
    // would let the payment total drift off totalUsdCents * rate.
    subtotalPaymentCents: convertUsdCentsToPaymentCents(subtotalUsdCents, usdToEgpRate),
    totalPaymentCents: convertUsdCentsToPaymentCents(totalUsdCents, usdToEgpRate),
    exchangeRate: usdToEgpRate,
  };
}
