// file: src/lib/orders/payable.ts
//
// Which orders may still be paid. Pure (no Prisma runtime): used by the create-intent route (retry by orderId) and by
// both checkout creators when they look for an open order to reuse, so an order that was cancelled, paid, refunded or
// already moved into production can never be re-opened for payment by accident.
export type PayableVerdict =
  | { ok: true }
  | { ok: false; code: "ORDER_ALREADY_PAID" | "ORDER_REFUNDED" | "ORDER_CANCELLED" | "ORDER_NOT_PAYABLE"; message: string };

// Payment states from which a (re)try is allowed, and the only fulfilment status an unpaid order can have.
export const PAYABLE_PAYMENT_STATUSES = ["UNPAID", "PENDING", "FAILED"] as const;
export const PAYABLE_ORDER_STATUS = "NEW" as const;

export function orderPayability(order: { status: string; paymentStatus: string }): PayableVerdict {
  if (order.paymentStatus === "PAID") return { ok: false, code: "ORDER_ALREADY_PAID", message: "This order has already been paid." };
  if (order.paymentStatus === "REFUNDED") {
    return { ok: false, code: "ORDER_REFUNDED", message: "This order was refunded and can't be paid again. Please start a new checkout." };
  }
  if (order.status === "CANCELLED") {
    return { ok: false, code: "ORDER_CANCELLED", message: "This order was cancelled and can't be paid. Please start a new checkout." };
  }
  if (order.status !== PAYABLE_ORDER_STATUS || !(PAYABLE_PAYMENT_STATUSES as readonly string[]).includes(order.paymentStatus)) {
    return { ok: false, code: "ORDER_NOT_PAYABLE", message: "This order can't be paid any more. Please start a new checkout." };
  }
  return { ok: true };
}

// Orders that checkout may reuse: still payable by the rules above.
export const isReusableOpenOrder = (order: { status: string; paymentStatus: string }) => orderPayability(order).ok;

// A Paymob payment key is valid for at most one hour (createPaymobPayment asks for expiration: 3600, the documented
// maximum), so a PENDING attempt with a payment link can still be paid for about an hour after it was created. A
// CREATED attempt without a link is a request that is still talking to Paymob; it only counts for a short while.
export const PAYMENT_LINK_LIVE_MS = 61 * 60 * 1000;
export const PAYMENT_IN_FLIGHT_LIVE_MS = 60 * 1000;

export function isLiveAttempt(attempt: { status: string; paymentUrl: string | null; createdAt: Date }, nowMs: number): boolean {
  const age = nowMs - attempt.createdAt.getTime();
  if (attempt.status === "PENDING") return Boolean(attempt.paymentUrl) && age < PAYMENT_LINK_LIVE_MS;
  if (attempt.status === "CREATED") return age < PAYMENT_IN_FLIGHT_LIVE_MS;
  return false;
}

// Stored consent on an order: valid for a retry only if it exists AND records exactly the Terms / Refund revision that is
// live now. (A missing time or version, or a different version, is treated as "not agreed" so the customer is asked again.)
export function termsConsentStatus(
  order: { termsAcceptedAt: Date | null; termsVersion: string | null },
  currentVersion: string,
): { ok: true } | { ok: false; termsChanged: boolean } {
  if (!order.termsAcceptedAt || !order.termsVersion) return { ok: false, termsChanged: false };
  if (order.termsVersion !== currentVersion) return { ok: false, termsChanged: true };
  return { ok: true };
}

// Customer-facing text for the 409 ORDER_COMPETING_PAYMENT answer. It only ever names the customer's OWN other order
// (the lookup is limited to their user id) and never includes payment links, amounts or personal data.
export function competingPaymentMessage(
  attempt: { status: string; startedAt: Date; orderNumber: string },
  nowMs: number,
): { message: string; linkExpiresAt: string | null; minutesLeft: number | null } {
  if (attempt.status === "CREATED") {
    return {
      message: `Another payment for this design is being started right now on order ${attempt.orderNumber}. To avoid being charged twice, please wait a minute and check that order, or continue that payment.`,
      linkExpiresAt: null,
      minutesLeft: null,
    };
  }
  const expiresAt = attempt.startedAt.getTime() + PAYMENT_LINK_LIVE_MS;
  const minutesLeft = Math.max(1, Math.ceil((expiresAt - nowMs) / 60000));
  return {
    message: `Another payment for this design is already in progress on order ${attempt.orderNumber}. To avoid being charged twice, please continue that order's payment, or wait until its payment link expires (about ${minutesLeft} more minute${minutesLeft === 1 ? "" : "s"}) and then try again.`,
    linkExpiresAt: new Date(expiresAt).toISOString(),
    minutesLeft,
  };
}
