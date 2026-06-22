"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { requireAdmin } from "src/lib/admin/auth";

const allowedStatusFlow: Record<OrderStatus, OrderStatus[]> = {
  NEW: [OrderStatus.CANCELLED],
  PAID: [OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
  IN_PRODUCTION: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [OrderStatus.NEW],
};

export async function updateOrderStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const nextStatus = String(formData.get("status") ?? "") as OrderStatus;
  if (!id || !Object.values(OrderStatus).includes(nextStatus)) throw new Error("Invalid order status request.");
  const order = await prisma.order.findUnique({ where: { id }, select: { status: true } });
  if (!order) throw new Error("Order not found.");
  if (!allowedStatusFlow[order.status].includes(nextStatus)) throw new Error("This order status transition is not allowed.");
  await prisma.$transaction([
    prisma.order.update({ where: { id }, data: { status: nextStatus } }),
    prisma.adminAuditLog.create({ data: { orderId: id, adminId: admin.id, action: "ORDER_STATUS_CHANGED", previousValue: order.status, newValue: nextStatus } }),
  ]);
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  redirect(`/admin/orders/${id}?notice=${encodeURIComponent(`Order moved to ${nextStatus.replaceAll("_", " ")}.`)}`);
}

export async function addAdminNoteAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!id || !body) throw new Error("Admin note cannot be empty.");
  await prisma.$transaction([
    prisma.adminNote.create({ data: { orderId: id, authorId: admin.id, body } }),
    prisma.adminAuditLog.create({ data: { orderId: id, adminId: admin.id, action: "ADMIN_NOTE_ADDED" } }),
  ]);
  revalidatePath(`/admin/orders/${id}`);
  redirect(`/admin/orders/${id}?notice=${encodeURIComponent("Internal note added.")}`);
}
