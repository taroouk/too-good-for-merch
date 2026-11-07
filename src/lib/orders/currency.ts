// file: src/lib/orders/currency.ts
//
// EGP is the only payment currency this store supports (decision of 9 Nov 2026). Orders are always created in it
// (PAYMENT_CURRENCY in totals.ts, converted with StoreSetting.usdToEgpRate) and the Paymob call refuses anything else, so
// what a customer is shown and what Paymob is sent can never be two different currencies. StoreSetting.currency and the
// STORE_CURRENCY variable do not change payments; this module only tells people when they say something unsupported.
// Pure and relative-import only: used by the admin settings form/page, the readiness warnings and the Paymob call.
export const SUPPORTED_PAYMENT_CURRENCY = "EGP" as const;

// null = fine (unset, or EGP). Otherwise a sentence for an admin / log line.
export function unsupportedCurrencyMessage(source: string, value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase();
  if (!code || code === SUPPORTED_PAYMENT_CURRENCY) return null;
  return `${source} is "${code}", but only ${SUPPORTED_PAYMENT_CURRENCY} is supported. It has no effect: every order is created and charged in ${SUPPORTED_PAYMENT_CURRENCY}.`;
}

// Admin form input for "Payment currency code": error message, or null when acceptable.
export function validatePaymentCurrencyInput(value: string): string | null {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return "Store name or currency code is invalid.";
  if (code !== SUPPORTED_PAYMENT_CURRENCY) return `Only ${SUPPORTED_PAYMENT_CURRENCY} is supported as the payment currency right now. Enter ${SUPPORTED_PAYMENT_CURRENCY}.`;
  return null;
}
