// Pure eligibility rules for the two money-affecting admin payment actions.
// DB-free so they can be unit tested (same pattern as access.ts).

export type PaymentRuleOrder = {
  paymentStatus: string;
  status: string;
  paymobTransactionId: string | null;
  totalCents: number;
};

// Returns an error message, or null when the action is allowed.
export function markPaidBlocker(order: PaymentRuleOrder): string | null {
  if (order.paymentStatus === "PAID") return "This order is already marked as paid.";
  if (order.paymentStatus === "REFUNDED") return "A refunded order can't be marked as paid.";
  if (order.status === "CANCELLED") return "Reinstate the cancelled order before marking it paid.";
  return null;
}

export function refundBlocker(order: PaymentRuleOrder): string | null {
  if (order.paymentStatus === "REFUNDED") return "This order has already been refunded.";
  if (order.paymentStatus !== "PAID") return "Only paid orders can be refunded.";
  if (!order.paymobTransactionId) return "No Paymob transaction is recorded for this order, so it can't be refunded automatically. Refund it from the Paymob dashboard and add a note.";
  if (!Number.isSafeInteger(order.totalCents) || order.totalCents <= 0) return "The order amount is invalid.";
  return null;
}

export const MIN_REASON_LENGTH = 5;

export function reasonProblem(reason: string): string | null {
  return reason.trim().length < MIN_REASON_LENGTH ? `Give a reason (at least ${MIN_REASON_LENGTH} characters) — it's recorded in the audit log.` : null;
}

// The admin must retype the order number to confirm a money action; a stray
// click or a wrong tab can't trigger it.
export function confirmationMatches(typed: string, orderNumber: string): boolean {
  return typed.trim().toUpperCase() === orderNumber.trim().toUpperCase();
}
