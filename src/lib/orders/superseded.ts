// file: src/lib/orders/superseded.ts
//
// Buy Now and the bag are separate checkouts, so the same design can end up on two open (unpaid) orders. Both could
// then be paid. This stops the SECOND payment from being started: an order whose design was already paid for, on
// another order, AFTER this one was created is refused (a deliberate re-order creates its order AFTER the earlier one
// was paid, so it is never affected). It does not cancel or change any order. It cannot stop a payment page that was
// already opened before the other order was paid -- that race needs a business decision (see the audit-fix report).
import type { Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { CheckoutError } from "src/lib/orders/errors";
import { orderBuildIds } from "src/lib/orders/duplicate-review";
import { isLiveAttempt, PAYABLE_ORDER_STATUS, PAYABLE_PAYMENT_STATUSES, PAYMENT_LINK_LIVE_MS } from "src/lib/orders/payable";

type OrderLike = { id: string; userId: string | null; buildId: string | null; createdAt: Date; items?: Array<{ preview: unknown }> };

export { orderBuildIds };

// A client with the one query this module needs: the global Prisma client, or the `tx` of an open transaction (a
// checkout reuse decision runs inside one and must not open a second connection).
type Db = Pick<Prisma.TransactionClient, "order">;

// The order that was paid for the same design AFTER `order` was created, or null.
export async function findSupersedingPaidOrder(db: Db, order: OrderLike) {
  if (!order.userId) return null;
  const mine = orderBuildIds(order);
  if (!mine.length) return null;
  const paid = await db.order.findMany({
    where: { userId: order.userId, id: { not: order.id }, paymentStatus: "PAID", paidAt: { gt: order.createdAt } },
    select: { id: true, orderNumber: true, buildId: true, items: { select: { preview: true } } },
  });
  return paid.find((other) => orderBuildIds(other).some((id) => mine.includes(id))) ?? null;
}

// Another open order of the same customer, for the same design, that has a payment link which can still be paid (or a
// payment being started right now). While one exists no second link may be created: two live links for one design are
// exactly how a design gets charged twice. Same client rule as above (`tx` inside a transaction).
export async function findCompetingLivePayment(db: Pick<Prisma.TransactionClient, "paymentAttempt">, order: OrderLike) {
  if (!order.userId) return null;
  const mine = orderBuildIds(order);
  if (!mine.length) return null;
  const now = Date.now();
  const attempts = await db.paymentAttempt.findMany({
    where: {
      status: { in: ["CREATED", "PENDING"] },
      createdAt: { gt: new Date(now - PAYMENT_LINK_LIVE_MS) },
      order: { userId: order.userId, id: { not: order.id }, status: PAYABLE_ORDER_STATUS, paymentStatus: { in: [...PAYABLE_PAYMENT_STATUSES] } },
    },
    select: { status: true, paymentUrl: true, createdAt: true, order: { select: { id: true, orderNumber: true, buildId: true, items: { select: { preview: true } } } } },
  });
  const hit = attempts.find((attempt) => isLiveAttempt(attempt, now) && orderBuildIds(attempt.order).some((id) => mine.includes(id)));
  return hit ? { order: hit.order, status: hit.status, startedAt: hit.createdAt } : null;
}

// Payment start: refuse an order whose design was already paid on another order after this one was created.
export async function assertNotSuperseded(order: OrderLike): Promise<void> {
  const winner = await findSupersedingPaidOrder(prisma, order);
  if (winner) {
    throw new CheckoutError(
      `Another order for this design (${winner.orderNumber}) was paid after you started this one, so this order can't be paid. To order another copy, start a new checkout.`,
      409,
      "ORDER_SUPERSEDED",
    );
  }
}
