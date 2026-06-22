"use server";

import { PaymentAttemptStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "src/lib/admin/auth";
import { prisma } from "src/lib/prisma";
import { createPaymobPayment } from "src/lib/payments/paymob";

export async function generateRetryPaymentLinkAction(formData: FormData) {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new Error("Order not found.");
  if (order.paymentStatus === PaymentStatus.PAID || order.paymentStatus === PaymentStatus.REFUNDED) throw new Error("Paid orders cannot be retried.");
  const method = order.paymentMethod ?? PaymentMethod.CARD;
  const attempt = await prisma.paymentAttempt.create({ data: { orderId, method, amountCents: order.totalCents, currency: order.currency } });
  try {
    const payment = await createPaymobPayment(order, method);
    await prisma.$transaction([
      prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: PaymentAttemptStatus.PENDING, externalId: payment.paymobOrderId, paymentUrl: payment.paymentUrl } }),
      prisma.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.PENDING, paymentUrl: payment.paymentUrl, paymobOrderId: payment.paymobOrderId, paymentFailureReason: null } }),
      prisma.adminAuditLog.create({ data: { orderId, adminId: admin.id, action: "PAYMENT_LINK_REGENERATED", metadata: { method } as Prisma.InputJsonValue } }),
    ]);
  } catch (error) {
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: PaymentAttemptStatus.FAILED, failureReason: error instanceof Error ? error.message : "Paymob error" } });
    throw error;
  }
  revalidatePath("/admin/payments");
  redirect(`/admin/payments?notice=${encodeURIComponent(`New payment link generated for ${order.orderNumber}.`)}`);
}

export async function toggleUserBlockedAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const block = String(formData.get("block") ?? "") === "true";
  if (!userId || userId === admin.id) throw new Error("Invalid customer action.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { blockedAt: block ? new Date() : null } }),
    prisma.adminAuditLog.create({ data: { adminId: admin.id, action: block ? "USER_BLOCKED" : "USER_UNBLOCKED", metadata: { userId } as Prisma.InputJsonValue } }),
  ]);
  revalidatePath("/admin/users");
  redirect(`/admin/users?notice=${encodeURIComponent(block ? "Customer blocked." : "Customer unblocked.")}`);
}

export async function updateStoreSettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const storeName = String(formData.get("storeName") ?? "").trim().slice(0, 120);
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  const taxRate = Number(formData.get("taxRate"));
  const shipping = Number(formData.get("shipping"));
  if (storeName.length < 2 || !/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid store settings.");
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !Number.isFinite(shipping) || shipping < 0) throw new Error("Tax or shipping is invalid.");
  await prisma.$transaction([
    prisma.storeSetting.upsert({
      where: { id: "store" },
      update: { storeName, currency, taxRateBps: Math.round(taxRate * 100), shippingCents: Math.round(shipping * 100) },
      create: { id: "store", storeName, currency, taxRateBps: Math.round(taxRate * 100), shippingCents: Math.round(shipping * 100) },
    }),
    prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "STORE_SETTINGS_UPDATED", metadata: { storeName, currency, taxRate, shipping } as Prisma.InputJsonValue } }),
  ]);
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?notice=${encodeURIComponent("Store settings saved.")}`);
}
