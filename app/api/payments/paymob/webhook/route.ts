import { OrderStatus, PaymentAttemptStatus, PaymentStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError } from "src/lib/api/responses";
import { prisma } from "src/lib/prisma";
import {
  classifyTransaction,
  paymentFailureReason,
  transactionMatchesOrder,
  verifyPaymobHmac,
  webhookEventKey,
} from "src/lib/payments/paymob";
import { rateLimit, rateLimitHeaders } from "src/lib/rate-limit";

export const runtime = "nodejs";
const MAX_WEBHOOK_BYTES = 256 * 1024;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function safePayload(value: unknown): Prisma.InputJsonValue {
  const text = JSON.stringify(value);
  return JSON.parse(text.length > 60_000 ? JSON.stringify({ truncated: true }) : text) as Prisma.InputJsonValue;
}

export async function POST(req: Request) {
  const limit = rateLimit(req, "paymob:webhook", 60, 60 * 1000);
  if (!limit.ok) {
    return apiError("Too many webhook requests.", 429, rateLimitHeaders(limit));
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_WEBHOOK_BYTES) {
    return apiError("Webhook payload is too large.", 413);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON.", 400);
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
      data: { eventKey, eventType, transactionId, validSignature, payload: eventPayload },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }

  if (!validSignature) {
    await prisma.webhookEvent.update({
      where: { eventKey },
      data: { errorMessage: "Invalid HMAC signature" },
    });
    return apiError("Invalid signature.", 401);
  }

  const remoteOrder = asObject(object.order);
  const paymobOrderId =
    remoteOrder.id == null ? (typeof object.order === "number" ? String(object.order) : "") : String(remoteOrder.id);
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
    await prisma.webhookEvent.update({
      where: { eventKey },
      data: { errorMessage: "Order not found", processedAt: new Date() },
    });
    return apiError("Order not found.", 404);
  }

  const knownIntegrationIds = [process.env.PAYMOB_INTEGRATION_ID, process.env.PAYMOB_WALLET_INTEGRATION_ID]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  const match = transactionMatchesOrder(object, order, knownIntegrationIds);
  if (!match.allMatch) {
    await prisma.webhookEvent.update({
      where: { eventKey },
      data: {
        orderId: order.id,
        errorMessage: !match.integrationIdMatches
          ? "Unrecognized integration_id"
          : "Payment amount or currency mismatch",
        processedAt: new Date(),
      },
    });
    return apiError("Payment data mismatch.", 422);
  }

  const { succeeded, refunded, failed } = classifyTransaction(object);

  await prisma.$transaction(async (tx) => {
    if (refunded) {
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: PaymentStatus.REFUNDED, refundedAt: new Date(), paymobTransactionId: transactionId },
      });
    } else if (succeeded) {
      const isDuplicateCharge =
        order.paymentStatus === PaymentStatus.PAID &&
        order.paymobTransactionId != null &&
        transactionId != null &&
        order.paymobTransactionId !== transactionId;

      if (isDuplicateCharge) {
        console.warn("PAYMOB_POSSIBLE_DOUBLE_CHARGE", {
          orderId: order.id,
          orderNumber: order.orderNumber,
          existingTransactionId: order.paymobTransactionId,
          newTransactionId: transactionId,
        });
        await tx.adminAuditLog.create({
          data: {
            orderId: order.id,
            action: "PAYMOB_POSSIBLE_DOUBLE_CHARGE",
            previousValue: order.paymobTransactionId,
            newValue: transactionId,
            metadata: { note: "A second successful Paymob transaction arrived for an order already marked PAID. Review for a duplicate customer charge." } as Prisma.InputJsonValue,
          },
        });
      } else {
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
      }
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
          status: succeeded
            ? PaymentAttemptStatus.SUCCEEDED
            : failed
              ? PaymentAttemptStatus.FAILED
              : PaymentAttemptStatus.PENDING,
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
