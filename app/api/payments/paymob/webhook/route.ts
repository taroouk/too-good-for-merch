import { PaymentAttemptStatus, PaymentStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError } from "src/lib/api/responses";
import { prisma } from "src/lib/prisma";
import {
  classifySuccessfulPayment,
  classifyTransaction,
  paymentFailureReason,
  transactionMatchesOrder,
  verifyPaymobHmac,
  webhookEventKey,
} from "src/lib/payments/paymob";
import { rateLimitHeaders } from "src/lib/rate-limit";
import { rateLimit } from "src/lib/rate-limit-db";

export const runtime = "nodejs";

// P1-12: without an explicit maxDuration this route silently inherits
// whatever Vercel's un-set default happens to be for the account it's
// deployed to (see the identical rationale in
// app/api/mockups/nanobanana/route.ts and
// app/api/payments/paymob/create-intent/route.ts). 60s is the highest
// value guaranteed to be valid on every Vercel plan tier. This handler's
// own worst case is its single prisma.$transaction with a 15s timeout for
// the order/payment-attempt update, comfortably inside 60s -- this is set
// mainly so a retried Paymob webhook delivery (Paymob retries on timeout)
// is never left racing an ambiguous, un-set platform default.
export const maxDuration = 60;
const MAX_WEBHOOK_BYTES = 256 * 1024;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function safePayload(value: unknown): Prisma.InputJsonValue {
  const text = JSON.stringify(value);
  return JSON.parse(text.length > 60_000 ? JSON.stringify({ truncated: true }) : text) as Prisma.InputJsonValue;
}

export async function POST(req: Request) {
  const limit = await rateLimit(req, "paymob:webhook", 60, 60 * 1000);
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
    // P3-21j: this used to be a 404. paymobOrderId/merchantOrderId are fixed
    // by the payload Paymob is redelivering, and the merchant_order_id
    // lookup fallback above already closes the only plausible order-not-
    // yet-committed race (orderNumber is written before Paymob is ever told
    // about the order -- see createCheckoutOrder/create-intent). So a
    // missing order here is permanent (test webhook, deleted order,
    // misconfigured env), not something a Paymob retry can ever fix --
    // returning non-2xx just makes Paymob retry-storm a condition retrying
    // cannot resolve. It's already durably recorded above (errorMessage +
    // processedAt) and surfaced in app/admin/payments for manual review, so
    // acknowledge receipt with 200 instead of inviting endless redelivery.
    return NextResponse.json({ received: true, unresolved: "order_not_found" });
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
    // P3-21j: same reasoning as the order-not-found branch above -- amount/
    // currency/integration_id are fixed in the redelivered payload, so a
    // mismatch here can never resolve itself through Paymob retrying. Ack
    // with 200 (already logged to WebhookEvent.errorMessage above and
    // visible in app/admin/payments) instead of returning 422 and inviting
    // a retry storm for a condition retries structurally cannot fix.
    return NextResponse.json({ received: true, unresolved: "payment_data_mismatch" });
  }

  const { succeeded, refunded, failed } = classifyTransaction(object);

  await prisma.$transaction(async (tx) => {
    // Every branch below is a read-then-write on the order's payment state,
    // so it must run against a row nobody else can move underneath it.
    // `order` above was read outside this transaction and is only used for
    // its id from here on: Paymob retries aggressively and can deliver two
    // transactions for the same order concurrently, and without this lock
    // both would observe the same pre-write snapshot -- letting a second
    // successful charge slip past the isDuplicateCharge guard (it would
    // read paymentStatus as still-unpaid and simply overwrite
    // paymobTransactionId, silently losing the double-charge signal this
    // code exists to raise). Matches the FOR UPDATE already used in
    // createCheckoutOrder and create-intent.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
    const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } });

    if (refunded) {
      await tx.order.update({
        where: { id: current.id },
        data: { paymentStatus: PaymentStatus.REFUNDED, refundedAt: new Date(), paymobTransactionId: transactionId },
      });
    } else if (succeeded) {
      // classifySuccessfulPayment reads `current` -- fetched above under
      // this same transaction's `FOR UPDATE` lock -- so a concurrent
      // delivery of a second, different transaction id for this order can
      // never both observe the pre-write state; see its own comment.
      const classification = classifySuccessfulPayment(current, transactionId);

      if (classification.isDuplicateCharge) {
        console.warn("PAYMOB_POSSIBLE_DOUBLE_CHARGE", {
          orderId: current.id,
          orderNumber: current.orderNumber,
          existingTransactionId: current.paymobTransactionId,
          newTransactionId: transactionId,
        });
        await tx.adminAuditLog.create({
          data: {
            orderId: current.id,
            action: "PAYMOB_POSSIBLE_DOUBLE_CHARGE",
            previousValue: current.paymobTransactionId,
            newValue: transactionId,
            metadata: { note: "A second successful Paymob transaction arrived for an order already marked PAID. Review for a duplicate customer charge." } as Prisma.InputJsonValue,
          },
        });
      } else {
        await tx.order.update({
          where: { id: current.id },
          data: classification.update,
        });
      }
    } else if (failed && current.paymentStatus !== PaymentStatus.PAID && current.paymentStatus !== PaymentStatus.REFUNDED) {
      await tx.order.update({
        where: { id: current.id },
        data: {
          paymentStatus: PaymentStatus.FAILED,
          paymobTransactionId: transactionId,
          paymentFailureReason: paymentFailureReason(object),
        },
      });
    }

    const attempt = await tx.paymentAttempt.findFirst({
      where: { orderId: current.id },
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
      data: { orderId: current.id, processed: true, processedAt: new Date() },
    });
  }, {
    // A concurrent retry for the same order now blocks on the FOR UPDATE
    // above until this transaction commits, so allow for genuinely waiting
    // one out rather than failing the webhook (which Paymob would retry,
    // reproducing the contention). Same budget as the other locked paths.
    maxWait: 10_000,
    timeout: 15_000,
  });

  return NextResponse.json({ received: true });
}
