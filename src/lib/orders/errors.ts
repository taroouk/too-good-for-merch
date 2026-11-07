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
  constructor(
    message: string,
    public status = 400,
    // A machine-readable reason the page can act on (default: CHECKOUT_VALIDATION_FAILED).
    public code?: string,
    // Extra fields returned to the client next to the message (e.g. the new total).
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

// The customer approves a TOTAL on the checkout page; an order is only created for exactly that amount.
// Missing => 400 (a request that never showed the customer a total); different => 409 with the current total,
// so the page can show it and ask again. Pure: unit-tested in errors.test.ts.
export function assertApprovedTotal(expected: unknown, actualTotalCents: number, currency: string): void {
  if (typeof expected !== "number" || !Number.isSafeInteger(expected) || expected <= 0) {
    throw new CheckoutError("Please review your order total and confirm it to continue.", 400, "TOTAL_CONFIRMATION_REQUIRED");
  }
  if (expected !== actualTotalCents) {
    throw new CheckoutError(
      "The total for your order has changed. Please review the new total and confirm it to continue.",
      409,
      "PRICE_CHANGED",
      { currentTotalCents: actualTotalCents, approvedTotalCents: expected, currency },
    );
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
