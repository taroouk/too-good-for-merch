"use server";

import { PaymentAttemptStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formString, runAdminAction } from "src/lib/admin/action";
import { safeAdminPath } from "src/lib/admin/action-url";
import { prisma } from "src/lib/prisma";
import { createPaymobPayment } from "src/lib/payments/paymob";
import { InvalidExchangeRateInputError, isValidExchangeRate, parseExchangeRateInput } from "src/pricing/currency";
import { DISPLAY_CURRENCIES, parseDisplayCurrency } from "src/pricing/display";

export async function generateRetryPaymentLinkAction(formData: FormData) {
  const admin = await requireAdmin();
  const orderId = formString(formData, "orderId", 100);
  return runAdminAction(safeAdminPath(formData.get("returnTo"), "/admin/payments"), async () => {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new AdminActionError("Order not found.");
    if (order.paymentStatus === PaymentStatus.PAID || order.paymentStatus === PaymentStatus.REFUNDED) throw new AdminActionError("Paid orders cannot be retried.");

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
        throw new AdminActionError("A payment link was just generated for this order. Please wait a moment before generating another.");
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
      const reason = error instanceof Error ? error.message : "Paymob error";
      await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: PaymentAttemptStatus.FAILED, failureReason: reason } });
      throw new AdminActionError(`Paymob rejected the request: ${reason}`.slice(0, 280));
    }
    revalidatePath("/admin/payments");
    revalidatePath(`/admin/orders/${orderId}`);
    return `New payment link generated for ${order.orderNumber}.`;
  });
}

export async function toggleUserBlockedAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = formString(formData, "userId", 100);
  const block = formString(formData, "block", 10) === "true";
  return runAdminAction(safeAdminPath(formData.get("returnTo"), "/admin/users"), async () => {
    if (!userId) throw new AdminActionError("Invalid customer action.");
    if (userId === admin.id) throw new AdminActionError("You can't block your own account.");
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
    if (!target) throw new AdminActionError("Customer not found.");
    if (block && target.role === "ADMIN") throw new AdminActionError("Remove this account's admin role (Team page) before blocking it.");
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { blockedAt: block ? new Date() : null } }),
      prisma.adminAuditLog.create({ data: { adminId: admin.id, action: block ? "USER_BLOCKED" : "USER_UNBLOCKED", metadata: { userId, email: target.email } as Prisma.InputJsonValue } }),
    ]);
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return block ? "Customer blocked." : "Customer unblocked.";
  });
}

export async function updateStoreSettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction("/admin/settings", async () => {
    const storeName = formString(formData, "storeName", 120);
    const currency = formString(formData, "currency", 3).toUpperCase();
    const taxRate = Number(formData.get("taxRate"));
    const shipping = Number(formData.get("shipping"));
    if (storeName.length < 2 || !/^[A-Z]{3}$/.test(currency)) throw new AdminActionError("Store name or currency code is invalid.");
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new AdminActionError("Tax rate must be between 0 and 100.");
    if (!Number.isFinite(shipping) || shipping < 0) throw new AdminActionError("Shipping must be zero or more.");

    let usdToEgpRate: number | null;
    try {
      usdToEgpRate = parseExchangeRateInput(String(formData.get("usdToEgpRate") ?? ""));
    } catch (error) {
      if (error instanceof InvalidExchangeRateInputError) throw new AdminActionError(error.message);
      throw new AdminActionError("USD → EGP exchange rate must be a positive number.");
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
    revalidatePath("/", "layout");
    return "Store settings saved.";
  });
}

// Which currency customers SEE prices in (builder, bag, bespoke quotes).
// Accounting stays USD and payment stays EGP -- this only changes display, so
// it is applied to existing and future pages alike but never to past orders.
export async function updateDisplayCurrencyAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(safeAdminPath(formData.get("returnTo"), "/admin/settings"), async () => {
    const raw = formString(formData, "displayCurrency", 3).toUpperCase();
    if (!(DISPLAY_CURRENCIES as readonly string[]).includes(raw)) throw new AdminActionError("Choose a supported currency.");
    const displayCurrency = parseDisplayCurrency(raw);

    const previous = await prisma.storeSetting.findUnique({ where: { id: "store" } });
    if (displayCurrency === "EGP" && !isValidExchangeRate(previous?.usdToEgpRate)) {
      throw new AdminActionError("Set the USD → EGP exchange rate first — EGP prices are calculated from it.");
    }
    if ((previous?.displayCurrency ?? "USD") === displayCurrency) return "Customers already see prices in " + displayCurrency + ".";

    await prisma.$transaction([
      prisma.storeSetting.upsert({
        where: { id: "store" },
        update: { displayCurrency },
        create: { id: "store", displayCurrency },
      }),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "DISPLAY_CURRENCY_UPDATED",
          metadata: { previous: previous?.displayCurrency ?? "USD", displayCurrency, rate: previous?.usdToEgpRate ?? null } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidatePath("/", "layout");
    return `Customers now see prices in ${displayCurrency}.`;
  });
}

// Changes only the USD -> EGP rate (the dashboard panel has no other store
// fields to carry). Logged exactly like the full settings form so the rate
// history on /admin/settings stays complete. Future checkouts only.
export async function updateExchangeRateAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(safeAdminPath(formData.get("returnTo"), "/admin/settings"), async () => {
    let rate: number | null;
    try {
      rate = parseExchangeRateInput(String(formData.get("usdToEgpRate") ?? ""));
    } catch (error) {
      if (error instanceof InvalidExchangeRateInputError) throw new AdminActionError(error.message);
      throw new AdminActionError("USD → EGP exchange rate must be a positive number.");
    }
    if (rate == null) throw new AdminActionError("Enter the exchange rate.");
    if (rate > 100000) throw new AdminActionError("That exchange rate looks too large — check the number.");

    const previous = await prisma.storeSetting.findUnique({ where: { id: "store" } });
    if (previous?.usdToEgpRate === rate) return "Exchange rate unchanged.";

    await prisma.$transaction([
      prisma.storeSetting.upsert({
        where: { id: "store" },
        update: { usdToEgpRate: rate },
        create: { id: "store", usdToEgpRate: rate },
      }),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "STORE_SETTINGS_UPDATED",
          metadata: {
            storeName: previous?.storeName ?? "Too Good For Merch",
            currency: previous?.currency ?? "USD",
            taxRate: (previous?.taxRateBps ?? 0) / 100,
            shipping: (previous?.shippingCents ?? 0) / 100,
            previousUsdToEgpRate: previous?.usdToEgpRate ?? null,
            usdToEgpRate: rate,
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidatePath("/", "layout");
    return `Exchange rate set: 1 USD = ${rate} EGP.`;
  });
}
