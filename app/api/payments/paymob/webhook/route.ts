import { OrderStatus, PaymentAttemptStatus, PaymentStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { paymentFailureReason, verifyPaymobHmac, webhookEventKey } from "src/lib/payments/paymob";

export const runtime = "nodejs";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safePayload(value: unknown): Prisma.InputJsonValue {
  const text = JSON.stringify(value);
  return JSON.parse(text.length > 60_000 ? JSON.stringify({ truncated: true }) : text) as Prisma.InputJsonValue;
}

export async function POST(req: Request) {
  const raw = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const object = asObject(body.obj ?? body);
  const signature = new URL(req.url).searchParams.get("hmac") ?? (typeof body.hmac === "string" ? body.hmac : null);
  const validSignature = verifyPaymobHmac(object, signature);
  const eventPayload = safePayload(body) as Prisma.JsonObject;
  const eventKey = webhookEventKey(eventPayload);
  const transactionId = object.id == null ? null : String(object.id);
  const eventType = typeof body.type === "string" ? body.type : "TRANSACTION";

  try {
    await prisma.webhookEvent.create({
      data: { eventKey, eventType, transactionId, validSignature, payload: eventPayload as Prisma.InputJsonValue },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }

  if (!validSignature) {
    await prisma.webhookEvent.update({ where: { eventKey }, data: { errorMessage: "Invalid HMAC signature" } });
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const remoteOrder = asObject(object.order);
  const paymobOrderId = remoteOrder.id == null ? (typeof object.order === "number" ? String(object.order) : "") : String(remoteOrder.id);
  const merchantOrderId = remoteOrder.merchant_order_id == null ? "" : String(remoteOrder.merchant_order_id);
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        ...(paymobOrderId ? [{ paymobOrderId }] : []),
        ...(merchantOrderId ? [{ orderNumber: merchantOrderId }] : []),
      ],
    },
  });

  if (!order) {
    await prisma.webhookEvent.update({ where: { eventKey }, data: { errorMessage: "Order not found", processedAt: new Date() } });
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const amountMatches = Number(object.amount_cents) === order.totalCents;
  const currencyMatches = String(object.currency ?? "").toUpperCase() === order.currency.toUpperCase();
  if (!amountMatches || !currencyMatches) {
    await prisma.webhookEvent.update({
      where: { eventKey },
      data: { orderId: order.id, errorMessage: "Payment amount or currency mismatch", processedAt: new Date() },
    });
    return NextResponse.json({ error: "Payment data mismatch." }, { status: 422 });
  }

  const succeeded = object.success === true && object.pending !== true && object.error_occured !== true;
  const refunded = object.is_refunded === true;
  const failed = !succeeded && object.pending !== true;

  await prisma.$transaction(async (tx) => {
    if (refunded) {
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: PaymentStatus.REFUNDED, refundedAt: new Date(), paymobTransactionId: transactionId },
      });
    } else if (succeeded) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          status: order.status === OrderStatus.NEW ? OrderStatus.PAID : order.status,
          paidAt: order.paidAt ?? new Date(),
          paymobTransactionId: transactionId,
          paymentFailureReason: null,
        },
      });
    } else if (failed && order.paymentStatus !== PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.REFUNDED) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.FAILED,
          paymobTransactionId: transactionId,
          paymentFailureReason: paymentFailureReason(object),
        },
      });
    }

    const attempt = await tx.paymentAttempt.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: "desc" },
    });
    if (attempt) {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: succeeded ? PaymentAttemptStatus.SUCCEEDED : failed ? PaymentAttemptStatus.FAILED : PaymentAttemptStatus.PENDING,
          failureReason: failed ? paymentFailureReason(object) : null,
          metadata: { transactionId, paymobOrderId } as Prisma.InputJsonValue,
        },
      });
    }
    await tx.webhookEvent.update({
      where: { eventKey },
      data: { orderId: order.id, processed: true, processedAt: new Date() },
    });
  });

  return NextResponse.json({ received: true });
}
