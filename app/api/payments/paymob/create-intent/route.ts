import { PaymentAttemptStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "src/auth";
import { apiError, readJsonObject } from "src/lib/api/responses";
import { prisma } from "src/lib/prisma";
import { CheckoutError, createCheckoutOrder } from "src/lib/orders/checkout";
import { createPaymobPayment, PaymobError, walletPaymentsEnabled } from "src/lib/payments/paymob";
import { rateLimit, rateLimitHeaders } from "src/lib/rate-limit";
import { resolveCurrentCurrency } from "src/pricing/engine";

export const runtime = "nodejs";

function paymobStageInfo(details: unknown): { stage?: string; status?: number } {
  if (details && typeof details === "object") {
    const record = details as Record<string, unknown>;
    return {
      stage: typeof record.stage === "string" ? record.stage : undefined,
      status: typeof record.status === "number" ? record.status : undefined,
    };
  }
  return {};
}

function errorResponse(error: unknown, orderId?: string) {
  if (error instanceof CheckoutError) {
    return NextResponse.json(
      { error: error.message, code: "CHECKOUT_VALIDATION_FAILED", orderId },
      { status: error.status },
    );
  }
  if (error instanceof PaymobError) {
    // The full redacted provider response was already logged by paymobFetch
    // (src/lib/payments/paymob.ts) at the point of failure; this just
    // correlates that log line with the order for diagnostics.
    console.error("[Paymob] create-intent failed", { orderId, ...paymobStageInfo(error.details) });
    return NextResponse.json(
      {
        error: "We couldn't start your payment. Please check your information and try again.",
        code: "PAYMENT_INITIALIZATION_FAILED",
        orderId,
      },
      { status: 502 },
    );
  }
  console.error("CHECKOUT_CREATE_ERROR", error instanceof Error ? error.message : error);
  return NextResponse.json(
    { error: "Unable to start payment. Please try again.", code: "INTERNAL_ERROR", orderId },
    { status: 500 },
  );
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
      // An order created before a store currency correction (StoreSetting /
      // STORE_CURRENCY) is permanently stuck with its original currency -
      // Paymob will reject the same wrong currency forever on retry. Refuse
      // the stale retry with a clear, actionable message instead of
      // repeating a doomed provider call (and instead of silently rewriting
      // a real order's currency, which is a pricing decision, not this
      // route's to make unilaterally).
      const currentCurrency = await resolveCurrentCurrency();
      if (order.currency !== currentCurrency) {
        throw new CheckoutError(
          "This order's payment configuration is outdated. Please return to the studio and start a new checkout.",
          409,
        );
      }
    } else {
      order = await createCheckoutOrder(session.user.id, {
        buildId: typeof body.buildId === "string" ? body.buildId : "",
        customer: customerInput(body.customer),
        placements: body.placements,
        size: body.size,
      });
    }

    // The check-and-create step below must be serialized per order: without
    // it, two near-simultaneous requests (double click, two tabs) can both
    // pass the "no reusable attempt yet" check before either has committed
    // its new PaymentAttempt row, producing two live Paymob payment links
    // for the same order. `FOR UPDATE` blocks a concurrent transaction on
    // the same order row until this one commits; it's safe under this
    // project's PgBouncer (pgbouncer=true) pooled connection because the
    // lock and every statement that depends on it live inside one
    // transaction, never spanning separate pooled connections.
    const decision = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order!.id} FOR UPDATE`;

      const recentAttempt = await tx.paymentAttempt.findFirst({
        where: {
          orderId: order!.id,
          method,
          status: PaymentAttemptStatus.PENDING,
          paymentUrl: { not: null },
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
      });
      if (recentAttempt?.paymentUrl) {
        return { kind: "reuse" as const, paymentUrl: recentAttempt.paymentUrl };
      }

      // A CREATED attempt with no paymentUrl yet means a request for this
      // exact order+method is still mid-flight talking to Paymob (that call
      // can take several seconds - see createPaymobPayment). Don't kick off
      // a second, redundant Paymob call and a second real payment link;
      // ask the caller to wait for the in-flight one instead.
      const inFlight = await tx.paymentAttempt.findFirst({
        where: {
          orderId: order!.id,
          method,
          status: PaymentAttemptStatus.CREATED,
          createdAt: { gte: new Date(Date.now() - 25 * 1000) },
        },
      });
      if (inFlight) {
        return { kind: "in-flight" as const };
      }

      const created = await tx.paymentAttempt.create({
        data: { orderId: order!.id, method, amountCents: order!.totalCents, currency: order!.currency },
      });
      return { kind: "created" as const, attemptId: created.id };
    }, {
      // Generous vs Prisma's 2s/5s defaults: a second concurrent request
      // may have to wait out this whole transaction under real network
      // latency to the database, not just the lock acquisition itself.
      maxWait: 10_000,
      timeout: 15_000,
    });

    if (decision.kind === "reuse") {
      return NextResponse.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentUrl: decision.paymentUrl,
      });
    }
    if (decision.kind === "in-flight") {
      // Returned directly (not thrown) so this never reaches the catch
      // block below: a sibling request is still talking to Paymob right
      // now and may succeed a moment later, so this request must not mark
      // the order FAILED - that's not what happened here, another request
      // just got there first.
      return NextResponse.json(
        {
          error: "A payment is already being started for this order. Please wait a moment and try again.",
          code: "PAYMENT_ALREADY_IN_PROGRESS",
          orderId: order.id,
        },
        { status: 409 },
      );
    }
    attemptId = decision.attemptId;

    const payment = await createPaymobPayment(order, method);
    await prisma.$transaction([
      prisma.paymentAttempt.update({
        where: { id: attemptId },
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
