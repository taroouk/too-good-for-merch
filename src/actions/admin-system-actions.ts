"use server";

import { PaymentAttemptStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "src/lib/admin/auth";
import { prisma } from "src/lib/prisma";
import { createPaymobPayment } from "src/lib/payments/paymob";
import { InvalidExchangeRateInputError, parseExchangeRateInput } from "src/pricing/currency";

export async function generateRetryPaymentLinkAction(formData: FormData) {
  const admin = await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new Error("Order not found.");
  if (order.paymentStatus === PaymentStatus.PAID || order.paymentStatus === PaymentStatus.REFUNDED) throw new Error("Paid orders cannot be retried.");

  // P2-10: a double-click (or a slow first request + impatient retry) on
  // "Generate retry link" previously had nothing stopping it from creating
  // two separate Paymob orders/payment links for the same order back to
  // back -- both real, chargeable Paymob orders, confusing for the
  // customer (which link is live?) and wasteful of Paymob's own order
  // creation quota. Guard server-side (the client-side pending-disable in
  // app/admin/payments/page.tsx only protects against the fast in-browser
  // double-click, not two separate form submissions/tabs) by checking for
  // a very recent PENDING attempt on this order and refusing to create
  // another one if the last one is still fresh.
  //
  // The check-then-create below is wrapped in a transaction that takes a
  // row lock on the Order (`SELECT ... FOR UPDATE`) so two genuinely
  // concurrent calls for the SAME order (two tabs, a real double-click
  // faster than one request/response cycle) are serialized rather than
  // racing: the second call's transaction blocks until the first commits
  // its new PaymentAttempt row, so it always sees that fresh row in its
  // own check. The status check also includes CREATED (not just PENDING)
  // because a freshly created attempt starts as CREATED and only becomes
  // PENDING after the Paymob API round-trip completes -- checking PENDING
  // alone left exactly the fast-concurrent-call window open that this
  // guard exists to close, since both calls would find no PENDING row yet.
  // Different orders are unaffected -- the row lock is scoped per orderId.
  const RECENT_ATTEMPT_WINDOW_MS = 30_000;
  const method = order.paymentMethod ?? PaymentMethod.CARD;
  const attempt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const recentAttempt = await tx.paymentAttempt.findFirst({
      where: {
        orderId,
        status: { in: [PaymentAttemptStatus.CREATED, PaymentAttemptStatus.PENDING] },
        createdAt: { gte: new Date(Date.now() - RECENT_ATTEMPT_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recentAttempt) {
      throw new Error("A payment link was just generated for this order. Please wait a moment before generating another.");
    }
    return tx.paymentAttempt.create({ data: { orderId, method, amountCents: order.totalCents, currency: order.currency } });
  });
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

  let usdToEgpRate: number | null;
  try {
    usdToEgpRate = parseExchangeRateInput(String(formData.get("usdToEgpRate") ?? ""));
  } catch (error) {
    if (error instanceof InvalidExchangeRateInputError) throw error;
    throw new Error("USD → EGP exchange rate must be a positive number.");
  }

  const previous = await prisma.storeSetting.findUnique({ where: { id: "store" } });

  await prisma.$transaction([
    prisma.storeSetting.upsert({
      where: { id: "store" },
      update: { storeName, currency, taxRateBps: Math.round(taxRate * 100), shippingCents: Math.round(shipping * 100), usdToEgpRate },
      create: { id: "store", storeName, currency, taxRateBps: Math.round(taxRate * 100), shippingCents: Math.round(shipping * 100), usdToEgpRate },
    }),
    prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "STORE_SETTINGS_UPDATED",
        metadata: {
          storeName,
          currency,
          taxRate,
          shipping,
          previousUsdToEgpRate: previous?.usdToEgpRate ?? null,
          usdToEgpRate,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?notice=${encodeURIComponent("Store settings saved.")}`);
}
