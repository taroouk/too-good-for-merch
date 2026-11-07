// file: src/lib/orders/duplicate-review.ts
//
// "Payment received -- under review": a PAID order whose design was ALSO paid on another order. The webhook records the
// money as received and writes a PAYMOB_DUPLICATE_DESIGN_PAYMENT audit entry + admin note (it can neither refuse a charge
// Paymob already made nor decide on a refund). This module only decides what the CUSTOMER is shown meanwhile. It never
// writes anything and never touches payment state.
//
// The decision is derived from payment facts (who was paid when, for which designs) as well as from the audit entry, so a
// lost or failed audit write can never make a flagged payment look like a normal confirmed order. It ends when the team
// moves the order on (status no longer PAID), cancels or refunds it.
// Pure, relative-import only (compiled by the payments test harness).
export const DUPLICATE_DESIGN_ACTION = "PAYMOB_DUPLICATE_DESIGN_PAYMENT";

export type ReviewableOrder = {
  id: string;
  buildId: string | null;
  createdAt: Date;
  paidAt: Date | null;
  status: string;
  paymentStatus: string;
  items?: Array<{ preview: unknown }>;
};

export function orderBuildIds(order: { buildId: string | null; items?: Array<{ preview: unknown }> }): string[] {
  const ids = new Set<string>();
  if (order.buildId) ids.add(order.buildId);
  for (const item of order.items ?? []) {
    const id = (item.preview as { buildId?: unknown } | null)?.buildId;
    if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

// Only a freshly paid order can be "under review": once the team moves it on (production, shipped, cancelled, refunded)
// the review is over and the normal status applies.
export const isUnreviewedPaidOrder = (order: { status: string; paymentStatus: string }) => order.status === "PAID" && order.paymentStatus === "PAID";

// The later-paid order of two that were open at the same time for one design: `other` was paid after `order` was created
// and before (or, on a tie, ahead of by id) `order` was paid -- the same rule the webhook applies when it flags a payment.
export function isLaterDuplicatePayment(order: ReviewableOrder, others: ReviewableOrder[]): boolean {
  if (!order.paidAt) return false;
  const mine = orderBuildIds(order);
  if (!mine.length) return false;
  return others.some((other) => {
    if (other.id === order.id || other.paymentStatus !== "PAID" || !other.paidAt) return false;
    if (other.paidAt.getTime() <= order.createdAt.getTime()) return false;
    const before = other.paidAt.getTime() < order.paidAt!.getTime() || (other.paidAt.getTime() === order.paidAt!.getTime() && other.id < order.id);
    return before && orderBuildIds(other).some((id) => mine.includes(id));
  });
}

// `candidates` are the orders about to be displayed; `allPaid` the customer's paid orders (may include the candidates);
// `flaggedByAudit` the ids that have a PAYMOB_DUPLICATE_DESIGN_PAYMENT entry.
export function duplicateReviewIds(candidates: ReviewableOrder[], allPaid: ReviewableOrder[], flaggedByAudit: Set<string>): Set<string> {
  const ids = new Set<string>();
  for (const order of candidates) {
    if (!isUnreviewedPaidOrder(order)) continue;
    if (flaggedByAudit.has(order.id) || isLaterDuplicatePayment(order, allPaid)) ids.add(order.id);
  }
  return ids;
}

// The two lookups, injected so this stays Prisma-free and testable. If a lookup fails the pages still render: the error is
// logged and the audit-based part is used when it succeeded (the derived part needs the paid-orders lookup).
export type ReviewDb = {
  audits: (orderIds: string[]) => Promise<string[]>; // ids of orders that have a duplicate-payment audit entry
  paidOrders: () => Promise<ReviewableOrder[]>;
};

export async function loadDuplicateReviewIds(db: ReviewDb, candidates: ReviewableOrder[], log: (message: string, error: unknown) => void = () => {}): Promise<Set<string>> {
  const open = candidates.filter(isUnreviewedPaidOrder);
  if (!open.length) return new Set();
  let flagged = new Set<string>();
  let allPaid: ReviewableOrder[] = [];
  try { flagged = new Set(await db.audits(open.map((order) => order.id))); } catch (error) { log("duplicate-review: audit lookup failed", error); }
  try { allPaid = await db.paidOrders(); } catch (error) { log("duplicate-review: paid-orders lookup failed", error); }
  return duplicateReviewIds(open, allPaid, flagged);
}

// Admin side: the notice shown at the top of an order that carries a duplicate-payment entry (pure, so it is testable).
export function duplicatePaymentNotice(auditLogs: Array<{ action: string; metadata: unknown; createdAt?: Date }>): { otherOrderNumber: string | null; otherOrderId: string | null } | null {
  const entry = auditLogs.find((log) => log.action === DUPLICATE_DESIGN_ACTION);
  if (!entry) return null;
  const meta = (entry.metadata ?? {}) as { otherOrderNumber?: unknown; otherOrderId?: unknown };
  return {
    otherOrderNumber: typeof meta.otherOrderNumber === "string" ? meta.otherOrderNumber : null,
    otherOrderId: typeof meta.otherOrderId === "string" ? meta.otherOrderId : null,
  };
}

// Admin notice for ONE order, from a targeted lookup (never from the last-N audit list, which later entries push the flag out of).
// `entry` = the order's own duplicate-payment audit row, or null; `derived` = the payment-facts rule (duplicate-review-db.ts) says so.
// While the order is still PAID/PAID it is "unresolved" (do not produce); afterwards the notice is informational evidence.
export function adminReviewNotice(
  order: { status: string; paymentStatus: string },
  entry: { metadata: unknown } | null,
  derived: boolean,
): { unresolved: boolean; otherOrderNumber: string | null; otherOrderId: string | null } | null {
  if (!entry && !derived) return null;
  const fromEntry = entry ? duplicatePaymentNotice([{ action: DUPLICATE_DESIGN_ACTION, metadata: entry.metadata }]) : null;
  return {
    unresolved: isUnreviewedPaidOrder(order),
    otherOrderNumber: fromEntry?.otherOrderNumber ?? null,
    otherOrderId: fromEntry?.otherOrderId ?? null,
  };
}

// System health row (the existing operational-signals page + dashboard): paid orders still waiting for a review decision.
export function duplicatePaymentHealthCheck(unresolvedCount: number): { id: string; label: string; level: "ok" | "fail"; detail: string; href: string } {
  return {
    id: "duplicate-payments",
    label: "Duplicate design payments under review",
    level: unresolvedCount > 0 ? "fail" : "ok",
    detail: unresolvedCount > 0
      ? `${unresolvedCount} paid order(s) are held for review because the same design was paid twice. Review each before production and decide on a refund of one payment; nothing is refunded or cancelled automatically.`
      : "None waiting for review.",
    href: `/admin/audit?action=${DUPLICATE_DESIGN_ACTION}`,
  };
}
