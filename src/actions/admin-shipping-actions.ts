"use server";

import { OrderStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formString, runAdminAction } from "src/lib/admin/action";
import { canMarkShipped, validateTracking, type OrderStatusKey } from "src/lib/orders/status-flow";
import { sendOrderShippedEmail } from "src/lib/notify/order";
import { prisma } from "src/lib/prisma";

function revalidateOrder(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath(`/orders/${id}`);
}

function readTracking(formData: FormData) {
  const result = validateTracking({
    carrier: formString(formData, "carrier", 80),
    trackingNumber: formString(formData, "trackingNumber", 100),
    trackingUrl: formString(formData, "trackingUrl", 600),
  });
  if (!result.ok) throw new AdminActionError(result.error);
  return result.value;
}

// IN_PRODUCTION -> SHIPPED, with the courier details the customer needs.
export async function markOrderShippedAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  return runAdminAction(`/admin/orders/${id}`, async () => {
    const tracking = readTracking(formData);
    const order = await prisma.order.findUnique({ where: { id }, select: { status: true, paymentStatus: true } });
    if (!order) throw new AdminActionError("Order not found.");
    if (!canMarkShipped(order.status as OrderStatusKey)) throw new AdminActionError("Only orders that are in production can be marked as shipped.");

    // Guarded on the status we just read, so a concurrent change (another
    // admin cancelling it) isn't silently overwritten.
    const moved = await prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id, status: OrderStatus.IN_PRODUCTION },
        data: { status: OrderStatus.SHIPPED, shippedAt: new Date(), ...tracking },
      });
      if (result.count === 0) return false;
      await tx.adminAuditLog.create({
        data: { orderId: id, adminId: admin.id, action: "ORDER_SHIPPED", previousValue: OrderStatus.IN_PRODUCTION, newValue: OrderStatus.SHIPPED, metadata: tracking as Prisma.InputJsonValue },
      });
      return true;
    });
    if (!moved) throw new AdminActionError("This order's status changed while you were editing. Reload and try again.");
    revalidateOrder(id);
    const email = await sendOrderShippedEmail(id);
    return email.sent ? "Order marked as shipped and the customer was emailed." : `Order marked as shipped. ${email.sent === false && email.skipped ? `(Email not sent: ${email.reason}.)` : "(The shipping email could not be sent — use Resend.)"}`;
  });
}

export async function updateTrackingAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  return runAdminAction(`/admin/orders/${id}`, async () => {
    const tracking = readTracking(formData);
    const order = await prisma.order.findUnique({ where: { id }, select: { status: true, carrier: true, trackingNumber: true } });
    if (!order) throw new AdminActionError("Order not found.");
    if (order.status !== OrderStatus.SHIPPED) throw new AdminActionError("Tracking can only be edited while the order is shipped.");
    await prisma.$transaction([
      prisma.order.update({ where: { id }, data: tracking }),
      prisma.adminAuditLog.create({
        data: { orderId: id, adminId: admin.id, action: "TRACKING_UPDATED", previousValue: `${order.carrier ?? ""} ${order.trackingNumber ?? ""}`.trim(), newValue: `${tracking.carrier} ${tracking.trackingNumber ?? ""}`.trim() },
      }),
    ]);
    revalidateOrder(id);
    return "Tracking details updated. Use Resend to email the customer the change.";
  });
}

export async function resendShippedEmailAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  return runAdminAction(`/admin/orders/${id}`, async () => {
    const order = await prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!order) throw new AdminActionError("Order not found.");
    if (order.status !== OrderStatus.SHIPPED && order.status !== OrderStatus.COMPLETED) throw new AdminActionError("Only shipped orders have a shipping email.");
    const result = await sendOrderShippedEmail(id);
    if (!result.sent) throw new AdminActionError(`Email not sent — ${result.skipped ? result.reason : result.error}.`);
    await prisma.adminAuditLog.create({ data: { orderId: id, adminId: admin.id, action: "SHIPPED_EMAIL_RESENT" } });
    revalidateOrder(id);
    return "Shipping email sent.";
  });
}
