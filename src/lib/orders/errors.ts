// file: src/lib/orders/errors.ts
//
// Pure, dependency-free error types/classifiers shared by checkout
// (src/lib/orders/checkout.ts) and the paymob create-intent route. Split
// out so the "does this error mean the order genuinely failed to pay, or
// did we just reject an unrelated request against it" decision is
// unit-testable without Prisma/Next -- see
// src/lib/orders/__tests__/errors.test.ts.
import { PaymentStatus } from "@prisma/client";

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// P0-5: create-intent's catch-all previously marked ANY error against an
// in-flight order as a payment failure, including CheckoutError -- thrown
// for validation/config problems that have nothing to do with a payment
// attempt actually failing (e.g. "This order's payment configuration is
// outdated" when StoreSetting's currency/rate changed after the order was
// created). That silently flipped a healthy PENDING order to FAILED before
// Paymob was ever contacted. A CheckoutError means the request was
// rejected, not that a charge was attempted and declined, so it must never
// mutate the order's payment state. Only a genuine payment-processing
// failure (a PaymobError from the provider call, or any other unexpected
// error surfacing after we've committed to attempting one) should.
export function orderFailureUpdateFor(
  order: { paymentStatus: PaymentStatus } | null | undefined,
  error: unknown,
): { paymentStatus: typeof PaymentStatus.FAILED; paymentFailureReason: string } | null {
  if (!order) return null;
  if (order.paymentStatus === PaymentStatus.PAID) return null;
  if (error instanceof CheckoutError) return null;
  return {
    paymentStatus: PaymentStatus.FAILED,
    paymentFailureReason: error instanceof Error ? error.message.slice(0, 500) : "Payment initialization failed",
  };
}
