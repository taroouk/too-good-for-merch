"use server";

import { revalidatePath } from "next/cache";
import { OrderStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { requireAdmin } from "src/lib/admin/auth";
import { requireNoteParent } from "src/lib/admin/notes";
import { canTransition, type OrderStatusKey } from "src/lib/orders/status-flow";
import { AdminActionError, formString, runAdminAction } from "src/lib/admin/action";

export async function updateOrderStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  const nextStatus = formString(formData, "status", 40) as OrderStatus;
  return runAdminAction(`/admin/orders/${id}`, async () => {
    if (!id || !Object.values(OrderStatus).includes(nextStatus)) throw new AdminActionError("Invalid order status request.");
    const order = await prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (!order) throw new AdminActionError("Order not found.");
    if (nextStatus === OrderStatus.SHIPPED) throw new AdminActionError("Use \"Mark as shipped\" and enter the courier and tracking details.");
    if (!canTransition(order.status as OrderStatusKey, nextStatus as OrderStatusKey)) throw new AdminActionError("This order status transition is not allowed.");
    await prisma.$transaction([
      prisma.order.update({ where: { id }, data: { status: nextStatus } }),
      prisma.adminAuditLog.create({ data: { orderId: id, adminId: admin.id, action: "ORDER_STATUS_CHANGED", previousValue: order.status, newValue: nextStatus } }),
    ]);
    revalidatePath("/admin");
    revalidatePath("/admin/orders");
    return `Order moved to ${nextStatus.replaceAll("_", " ")}.`;
  });
}

export async function addAdminNoteAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = formString(formData, "id", 100);
  const body = formString(formData, "body", 4000);
  return runAdminAction(`/admin/orders/${id}`, async () => {
    if (!id || !body) throw new AdminActionError("Admin note cannot be empty.");
    try {
      requireNoteParent(await prisma.order.findUnique({ where: { id }, select: { id: true } }), "Order not found.");
    } catch (error) {
      throw new AdminActionError(error instanceof Error ? error.message : "Order not found.");
    }
    await prisma.$transaction([
      prisma.adminNote.create({ data: { orderId: id, authorId: admin.id, body } }),
      prisma.adminAuditLog.create({ data: { orderId: id, adminId: admin.id, action: "ADMIN_NOTE_ADDED" } }),
    ]);
    revalidatePath(`/admin/orders/${id}`);
    return "Internal note added.";
  });
}
