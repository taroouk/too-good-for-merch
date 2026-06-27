import { PaymentAttemptStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "src/auth";
import { apiError, readJsonObject } from "src/lib/api/responses";
import { prisma } from "src/lib/prisma";
import { CheckoutError, createCheckoutOrder } from "src/lib/orders/checkout";
import { createPaymobPayment, PaymobError, walletPaymentsEnabled } from "src/lib/payments/paymob";
import { rateLimit, rateLimitHeaders } from "src/lib/rate-limit";

export const runtime = "nodejs";

function errorResponse(error: unknown, orderId?: string) {
  if (error instanceof CheckoutError) {
    return NextResponse.json({ error: error.message, orderId }, { status: error.status });
  }
  if (error instanceof PaymobError) {
    console.error("PAYMOB_CREATE_ERROR", error.message, error.details);
    return NextResponse.json({ error: error.message, orderId }, { status: 502 });
  }
  console.error("CHECKOUT_CREATE_ERROR", error);
  return NextResponse.json({ error: "Unable to start payment. Please try again.", orderId }, { status: 500 });
}

function customerInput(value: unknown) {
  const customer = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    name: String(customer.name ?? ""),
    email: String(customer.email ?? ""),
    phone: String(customer.phone ?? ""),
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return apiError("Sign in to continue.", 401);
  }

  const limit = rateLimit(req, `checkout:${session.user.id}`, 12, 10 * 60 * 1000);
  if (!limit.ok) {
    return apiError(
      "Too many checkout attempts. Please try again later.",
      429,
      rateLimitHeaders(limit),
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { blockedAt: true },
  });
  if (!user || user.blockedAt) {
    return apiError("This account cannot place orders.", 403);
  }

  const body = await readJsonObject(req);
  if (!body) {
    return apiError("Invalid checkout request.", 400);
  }

  if (body.method !== PaymentMethod.CARD && body.method !== PaymentMethod.WALLET) {
    return apiError("Invalid payment method.", 400);
  }

  const method = body.method;
  if (method === PaymentMethod.WALLET && !walletPaymentsEnabled()) {
    return apiError("Wallet payments are not enabled.", 400);
  }

  let order: Awaited<ReturnType<typeof createCheckoutOrder>> | null = null;
  let attemptId: string | null = null;

  try {
    if (typeof body.orderId === "string" && body.orderId) {
      order = await prisma.order.findFirst({
        where: { id: body.orderId, userId: session.user.id },
        include: { items: true },
      });
      if (!order) throw new CheckoutError("Order not found.", 404);
      if (order.paymentStatus === PaymentStatus.PAID || order.paymentStatus === PaymentStatus.REFUNDED) {
        throw new CheckoutError("This order has already been paid.", 409);
      }
    } else {
      order = await createCheckoutOrder(session.user.id, {
        buildId: typeof body.buildId === "string" ? body.buildId : "",
        customer: customerInput(body.customer),
        placements: body.placements,
        size: body.size,
      });
    }

    const recentAttempt = await prisma.paymentAttempt.findFirst({
      where: {
        orderId: order.id,
        method,
        status: PaymentAttemptStatus.PENDING,
        paymentUrl: { not: null },
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recentAttempt?.paymentUrl) {
      return NextResponse.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentUrl: recentAttempt.paymentUrl,
      });
    }

    const attempt = await prisma.paymentAttempt.create({
      data: { orderId: order.id, method, amountCents: order.totalCents, currency: order.currency },
    });
    attemptId = attempt.id;

    const payment = await createPaymobPayment(order, method);
    await prisma.$transaction([
      prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PaymentAttemptStatus.PENDING,
          externalId: payment.paymobOrderId,
          paymentUrl: payment.paymentUrl,
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod: method,
          paymobOrderId: payment.paymobOrderId,
          paymentUrl: payment.paymentUrl,
          paymentFailureReason: null,
        },
      }),
    ]);

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentUrl: payment.paymentUrl,
      walletEnabled: walletPaymentsEnabled(),
    });
  } catch (error) {
    if (attemptId) {
      await prisma.paymentAttempt
        .update({
          where: { id: attemptId },
          data: {
            status: PaymentAttemptStatus.FAILED,
            failureReason: error instanceof Error ? error.message.slice(0, 500) : "Unknown payment error",
          },
        })
        .catch(() => undefined);
    }
    if (order && order.paymentStatus !== PaymentStatus.PAID) {
      await prisma.order
        .update({
          where: { id: order.id },
          data: {
            paymentStatus: PaymentStatus.FAILED,
            paymentFailureReason: error instanceof Error ? error.message.slice(0, 500) : "Payment initialization failed",
          },
        })
        .catch(() => undefined);
    }
    return errorResponse(error, order?.id);
  }
}
