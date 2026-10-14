"use server";

import { OrderStatus, PaymentAttemptStatus, PaymentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formString, runAdminAction } from "src/lib/admin/action";
import { confirmationMatches, markPaidBlocker, reasonProblem, refundBlocker } from "src/lib/admin/payment-rules";
import { prisma } from "src/lib/prisma";
import { sendOrderConfirmationEmail } from "src/lib/notify/order";
import { removePaidBagItem } from "src/lib/bag-server";
import { PaymobError, refundPaymobTransaction } from "src/lib/payments/paymob";

function revalidateOrder(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/payments");
  revalidatePath(`/admin/orders/${id}`);
}

// Records money that arrived outside Paymob's webhook (bank transfer, cash,
// or a webhook that never landed). Never touches Paymob.
export async function markOrderPaidManuallyAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  return runAdminAction(`/admin/orders/${id}`, async () => {
    const reason = formString(formData, "reason", 500);
    const typed = formString(formData, "confirmOrderNumber", 60);
    const reference = formString(formData, "reference", 120);
    const order = await prisma.order.findUnique({ where: { id }, select: { id: true, orderNumber: true, paymentStatus: true, status: true, paymobTransactionId: true, totalCents: true } });
    if (!order) throw new AdminActionError("Order not found.");
    const blocker = markPaidBlocker(order);
    if (blocker) throw new AdminActionError(blocker);
    const problem = reasonProblem(reason);
    if (problem) throw new AdminActionError(problem);
    if (!confirmationMatches(typed, order.orderNumber)) throw new AdminActionError(`Type the order number (${order.orderNumber}) exactly to confirm.`);

    // Guarded update: only flips an order that is still unpaid at write
    // time, so a webhook landing a moment earlier isn't overwritten.
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id, paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.FAILED] } },
        data: { paymentStatus: PaymentStatus.PAID, paidAt: new Date(), paymentFailureReason: null, ...(order.status === OrderStatus.NEW ? { status: OrderStatus.PAID } : {}) },
      });
      if (result.count === 0) return false;
      await tx.paymentAttempt.updateMany({ where: { orderId: id, status: { in: [PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PENDING] } }, data: { status: PaymentAttemptStatus.FAILED, failureReason: "Superseded by manual payment confirmation" } });
      await tx.adminNote.create({ data: { orderId: id, authorId: admin.id, body: `Marked as paid manually. Reason: ${reason}${reference ? ` (reference: ${reference})` : ""}` } });
      await tx.adminAuditLog.create({
        data: { orderId: id, adminId: admin.id, action: "ORDER_MARKED_PAID_MANUALLY", previousValue: order.paymentStatus, newValue: PaymentStatus.PAID, metadata: { reason, reference, amountCents: order.totalCents } as Prisma.InputJsonValue },
      });
      return true;
    });
    if (!updated) throw new AdminActionError("This order's payment status changed while you were confirming. Reload and check it.");
    revalidateOrder(id);
    await removePaidBagItem(id);
    const email = await sendOrderConfirmationEmail(id);
    return email.sent ? "Order marked as paid and the customer was emailed." : "Order marked as paid.";
  });
}

export async function refundOrderAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  return runAdminAction(`/admin/orders/${id}`, async () => {
    const reason = formString(formData, "reason", 500);
    const typed = formString(formData, "confirmOrderNumber", 60);
    const order = await prisma.order.findUnique({ where: { id }, select: { id: true, orderNumber: true, paymentStatus: true, status: true, paymobTransactionId: true, totalCents: true, currency: true } });
    if (!order) throw new AdminActionError("Order not found.");
    const blocker = refundBlocker(order);
    if (blocker) throw new AdminActionError(blocker);
    const problem = reasonProblem(reason);
    if (problem) throw new AdminActionError(problem);
    if (!confirmationMatches(typed, order.orderNumber)) throw new AdminActionError(`Type the order number (${order.orderNumber}) exactly to confirm.`);

    // Claim the refund first (PAID -> REFUNDED, guarded) so two admins
    // can't both send a refund to Paymob; undone below if Paymob refuses.
    const claimed = await prisma.order.updateMany({ where: { id, paymentStatus: PaymentStatus.PAID }, data: { paymentStatus: PaymentStatus.REFUNDED, refundedAt: new Date() } });
    if (claimed.count === 0) throw new AdminActionError("This order's payment status changed. Reload and check it.");

    let refundTransactionId: string | null = null;
    try {
      ({ refundTransactionId } = await refundPaymobTransaction(order.paymobTransactionId as string, order.totalCents));
    } catch (error) {
      await prisma.order.updateMany({ where: { id, paymentStatus: PaymentStatus.REFUNDED }, data: { paymentStatus: PaymentStatus.PAID, refundedAt: null } });
      await prisma.adminAuditLog.create({ data: { orderId: id, adminId: admin.id, action: "ORDER_REFUND_FAILED", metadata: { reason, message: error instanceof Error ? error.message : "unknown" } as Prisma.InputJsonValue } });
      const detail = error instanceof PaymobError ? error.message : "Could not reach Paymob.";
      throw new AdminActionError(`Refund not sent — ${detail} The order is still marked paid. Check the Paymob dashboard (a transaction usually can only be refunded after it settles, or voided the same day).`);
    }

    await prisma.$transaction([
      prisma.adminNote.create({ data: { orderId: id, authorId: admin.id, body: `Refunded ${(order.totalCents / 100).toFixed(2)} ${order.currency} via Paymob. Reason: ${reason}` } }),
      prisma.adminAuditLog.create({
        data: { orderId: id, adminId: admin.id, action: "ORDER_REFUNDED", previousValue: PaymentStatus.PAID, newValue: PaymentStatus.REFUNDED, metadata: { reason, amountCents: order.totalCents, refundTransactionId } as Prisma.InputJsonValue },
      }),
    ]);
    revalidateOrder(id);
    return `Refund of ${(order.totalCents / 100).toFixed(2)} ${order.currency} sent to Paymob.`;
  });
}

export async function resendOrderConfirmationAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  return runAdminAction(`/admin/orders/${id}`, async () => {
    const order = await prisma.order.findUnique({ where: { id }, select: { id: true, paymentStatus: true } });
    if (!order) throw new AdminActionError("Order not found.");
    if (order.paymentStatus !== PaymentStatus.PAID) throw new AdminActionError("Only paid orders have a confirmation email.");
    const result = await sendOrderConfirmationEmail(id, { force: true });
    if (!result.sent) {
      const reason = result.skipped ? result.reason : result.error;
      throw new AdminActionError(`Email not sent — ${reason}.`);
    }
    await prisma.adminAuditLog.create({ data: { orderId: id, adminId: admin.id, action: "ORDER_CONFIRMATION_RESENT" } });
    revalidateOrder(id);
    return "Confirmation email sent.";
  });
}
