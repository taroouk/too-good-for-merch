// file: src/lib/orders/duplicate-review-db.ts
// Prisma wiring for duplicate-review.ts (read-only).
import { prisma } from "src/lib/prisma";
import { DUPLICATE_DESIGN_ACTION, loadDuplicateReviewIds, type ReviewableOrder } from "src/lib/orders/duplicate-review";

export async function duplicateReviewIdsFor(userId: string | null, orders: ReviewableOrder[]): Promise<Set<string>> {
  if (!userId) return new Set();
  return loadDuplicateReviewIds(
    {
      audits: async (orderIds) => (await prisma.adminAuditLog.findMany({ where: { orderId: { in: orderIds }, action: DUPLICATE_DESIGN_ACTION }, select: { orderId: true } })).map((row) => row.orderId as string),
      paidOrders: () => prisma.order.findMany({ where: { userId, paymentStatus: "PAID" }, select: { id: true, buildId: true, createdAt: true, paidAt: true, status: true, paymentStatus: true, items: { select: { preview: true } } } }),
    },
    orders,
    (message, error) => console.error(`[orders] ${message}`, error),
  );
}
