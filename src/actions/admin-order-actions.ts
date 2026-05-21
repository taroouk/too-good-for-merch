"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OrderStatus, Role } from "@prisma/client";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";

const allowedStatusFlow: Record<OrderStatus, OrderStatus[]> = {
  NEW: [OrderStatus.PAID, OrderStatus.CANCELLED],
  PAID: [OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
  IN_PRODUCTION: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

async function requireAdmin() {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== Role.ADMIN) {
    redirect("/login");
  }

  return session.user;
}

export async function updateOrderStatusAction(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id");
  const nextStatus = formData.get("status");

  if (typeof id !== "string" || typeof nextStatus !== "string") {
    throw new Error("Invalid order status request.");
  }

  if (!Object.values(OrderStatus).includes(nextStatus as OrderStatus)) {
    throw new Error("Invalid order status.");
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      status: true,
    },
  });

  if (!order) {
    throw new Error("Order not found.");
  }

  const typedNextStatus = nextStatus as OrderStatus;
  const allowedNextStatuses = allowedStatusFlow[order.status];

  if (!allowedNextStatuses.includes(typedNextStatus)) {
    throw new Error("This order status transition is not allowed.");
  }

  await prisma.order.update({
    where: { id },
    data: {
      status: typedNextStatus,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}

export async function addAdminNoteAction(formData: FormData) {
  const admin = await requireAdmin();

  const id = formData.get("id");
  const body = formData.get("body");

  if (typeof id !== "string" || typeof body !== "string") {
    throw new Error("Invalid admin note request.");
  }

  const trimmedBody = body.trim();

  if (!trimmedBody) {
    throw new Error("Admin note cannot be empty.");
  }

  await prisma.adminNote.create({
    data: {
      orderId: id,
      authorId: admin.id,
      body: trimmedBody,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}