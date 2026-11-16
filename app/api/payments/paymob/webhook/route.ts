import { sendOrderConfirmationEmail } from "src/lib/notify/order";
import { removePaidBagItem } from "src/lib/bag-server";
import { OrderStatus, PaymentAttemptStatus, PaymentStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError } from "src/lib/api/responses";
import { prisma } from "src/lib/prisma";
import {
  classifySuccessfulPayment,
  classifyTransaction,
  paymentFailureReason,
  transactionMatchesOrder,
  baseOrderNumber,
  verifyPaymobHmac,
  webhookEventKey,
} from "src/lib/payments/paymob";
import {
  ORDER_BINDING_MESSAGES,
  checkOrderBinding,
  claimWebhookEvent,
  isWebhookEventProcessed,
  lateSuccessAfterRefund,
  lateSuccessNoteBody,
  mergeAttemptMetadata,
  refundAttemptMetadata,
  refundAuditMetadata,
  recordRejectedWebhook,
  refundedOrderUpdate,
  signedPaymobOrderId,
  webhookRejectionReason,
} from "src/lib/payments/webhook-event";
import { BodyTooLargeError, readTextWithLimit } from "src/lib/http/read-limited-body";
import { rateLimitHeaders } from "src/lib/rate-limit";
import { rateLimit } from "src/lib/rate-limit-db";
import { findSupersedingPaidOrder, orderBuildIds } from "src/lib/orders/superseded";

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

  // The size limit is enforced WHILE the body streams in (a chunked request, a missing Content-Length or a false one cannot get
  // past it, and nothing beyond the limit is buffered).
  let raw: string;
  try {
    raw = await readTextWithLimit(req, MAX_WEBHOOK_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return apiError("Webhook payload is too large.", 413);
    throw error;
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON.", 400);
  }
  // `null`, a number or an array parses fine but is not a webhook: refuse it here (it used to throw further down).
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("Invalid JSON.", 400);
  }

  const object = asObject(body.obj ?? body);
  const signature = new URL(req.url).searchParams.get("hmac") ?? (typeof body.hmac === "string" ? body.hmac : null);
  // M1: the signature is checked BEFORE anything is written. A request that fails it never creates a row with its
  // payload (see recordRejectedWebhook for the one bounded marker row that keeps the rejections visible to admins).
  if (!verifyPaymobHmac(object, signature)) {
    const reason = webhookRejectionReason(Boolean(process.env.PAYMOB_HMAC_SECRET?.trim()), signature);
    await recordRejectedWebhook(prisma.webhookEvent, reason);
    console.warn("PAYMOB_WEBHOOK_REJECTED", { reason, bytes: Buffer.byteLength(raw, "utf8") });
    return apiError("Invalid signature.", 401);
  }
  const validSignature = true;
  const eventPayload = safePayload(body) as Prisma.JsonObject;
  // The key is derived from the FULL body, not the stored copy: safePayload() replaces a payload over 60 KB with a stub, and
  // keying on the stub would give every large event the same key (the second one would be dropped as a "duplicate").
  const eventKey = webhookEventKey(body as Prisma.JsonObject);
  const transactionId = object.id == null ? null : String(object.id);
  const eventType = typeof body.type === "string" ? body.type : "TRANSACTION";

  // An existing row only means "duplicate" once it was actually processed. If the first attempt died before
  // finishing, Paymob's retry of the same payload must be processed (see webhook-event.ts).
  const claim = await claimWebhookEvent(prisma.webhookEvent, {
    eventKey,
    eventType,
    transactionId,
    validSignature,
    payload: eventPayload,
  });
  if (claim === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const remoteOrder = asObject(object.order);
  const paymobOrderId = signedPaymobOrderId(object);
  const merchantOrderId =
    remoteOrder.merchant_order_id == null ? "" : baseOrderNumber(String(remoteOrder.merchant_order_id));

  // The order is identified by the SIGNED Paymob order id only (never by the unsigned merchant_order_id, and never with an OR
  // that lets one identifier override the other): see checkOrderBinding. It is matched against the ids persisted when the
  // payments were created -- the order's current paymobOrderId and each attempt's externalId.
  const candidates = paymobOrderId
    ? await prisma.order.findMany({
        where: { OR: [{ paymobOrderId }, { paymentAttempts: { some: { externalId: paymobOrderId } } }] },
        take: 2,
      })
    : [];
  const binding = checkOrderBinding(paymobOrderId, candidates, merchantOrderId);

  if (!binding.ok) {
    // Nothing is modified: no order, no payment attempt, no payment status. The event is recorded for the admin payments page and
    // acknowledged with 200 -- a retry cannot fix a payload whose identifiers are fixed (same convention as before).
    await prisma.webhookEvent.update({
      where: { eventKey },
      data: {
        ...(binding.problem === "order_identifier_conflict" && candidates[0] ? { orderId: candidates[0].id } : {}),
        errorMessage: ORDER_BINDING_MESSAGES[binding.problem],
        processedAt: new Date(),
      },
    });
    console.warn("PAYMOB_WEBHOOK_UNRESOLVED", { problem: binding.problem });
    return NextResponse.json({
      received: true,
      unresolved: binding.problem === "unknown_signed_order_id" || binding.problem === "missing_signed_order_id" ? "order_not_found" : binding.problem,
    });
  }
  const order = candidates[0];

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
  // Set inside the transaction below when this successful payment is for a design that was ALSO paid on another order.
  let duplicateDesignPayment: { orderNumber: string } | null = null;
  // Set inside the transaction below when a concurrent delivery of this same event already finished it.
  let processedByConcurrentDelivery = false;
  // Set inside the transaction below when a successful transaction arrives for an order that is already REFUNDED. REFUNDED is
  // terminal: the order, the payment attempt, the bag and the confirmation e-mail are all left alone.
  let successAfterRefund = false;

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

    // Two deliveries of the SAME not-yet-processed event can both get here (see claimWebhookEvent); they queue on the
    // lock above. The one that waited must not repeat the first one's side effects (admin notes/audit rows, refund
    // timestamp), so re-read the event under the lock: if the winner already committed it, do nothing.
    if (await isWebhookEventProcessed(tx.webhookEvent, eventKey)) {
      processedByConcurrentDelivery = true;
      return;
    }

    if (refunded) {
      await tx.order.update({
        where: { id: current.id },
        data: refundedOrderUpdate(current, transactionId),
      });
      // The order keeps the original charge id; the refund's own id is recorded in the audit log (and, below, on the attempt).
      await tx.adminAuditLog.create({
        data: {
          orderId: current.id,
          action: "PAYMOB_REFUND_RECORDED",
          previousValue: current.paymobTransactionId,
          newValue: transactionId,
          metadata: refundAuditMetadata(current, transactionId) as Prisma.InputJsonValue,
        },
      });
    } else if (succeeded) {
      // classifySuccessfulPayment reads `current` -- fetched above under
      // this same transaction's `FOR UPDATE` lock -- so a concurrent
      // delivery of a second, different transaction id for this order can
      // never both observe the pre-write state; see its own comment.
      const classification = classifySuccessfulPayment(current, transactionId);

      if (classification.afterRefund) {
        // Out-of-order delivery: the refund was processed first. Never move a REFUNDED order back to PAID. Record it once per
        // incoming transaction (a redelivery of the same late success must not add a second record).
        successAfterRefund = true;
        const late = lateSuccessAfterRefund(current, transactionId);
        const already = await tx.adminAuditLog.findFirst({
          where: { orderId: current.id, action: "PAYMOB_SUCCESS_AFTER_REFUND", newValue: transactionId },
          select: { id: true },
        });
        if (!already) {
          if (late.possibleSecondCharge) {
            console.warn("PAYMOB_POSSIBLE_DOUBLE_CHARGE_AFTER_REFUND", {
              orderId: current.id,
              orderNumber: current.orderNumber,
              storedTransactionId: late.storedTransactionId,
              chargeRecorded: late.chargeRecorded,
              incomingTransactionId: late.incomingTransactionId,
            });
            await tx.adminNote.create({
              data: {
                orderId: current.id,
                body: lateSuccessNoteBody(late),
              },
            });
          }
          await tx.adminAuditLog.create({
            data: {
              orderId: current.id,
              action: "PAYMOB_SUCCESS_AFTER_REFUND",
              previousValue: late.storedTransactionId,
              newValue: transactionId,
              metadata: {
                storedTransactionId: late.storedTransactionId,
                chargeRecorded: late.chargeRecorded,
                // null when no charge was ever recorded (the stored id may then be the refund's id)
                originalChargeTransactionId: late.originalChargeTransactionId,
                incomingTransactionId: late.incomingTransactionId,
                possibleSecondCharge: late.possibleSecondCharge,
                note: "A successful Paymob transaction arrived for an order that was already REFUNDED. The order was not changed.",
              } as Prisma.InputJsonValue,
            },
          });
        }
      } else if (classification.isDuplicateCharge) {
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

        // The money was received and is recorded as received -- the app cannot refuse a charge Paymob already made.
        // What it can do is notice that this design was also paid on another order and make sure a person looks at it
        // before anything is produced. The designs are locked (fixed order) first, so two webhooks for two orders of the
        // same design are decided one after the other and exactly one of them is flagged.
        const items = await tx.orderItem.findMany({ where: { orderId: current.id }, select: { preview: true } });
        const orderForCheck = { ...current, items };
        for (const buildId of orderBuildIds(orderForCheck).sort()) {
          await tx.$queryRaw`SELECT id FROM "Build" WHERE id = ${buildId} FOR UPDATE`;
        }
        const other = await findSupersedingPaidOrder(tx, orderForCheck);
        if (other) {
          duplicateDesignPayment = { orderNumber: other.orderNumber };
          await tx.adminAuditLog.create({
            data: {
              orderId: current.id,
              action: "PAYMOB_DUPLICATE_DESIGN_PAYMENT",
              newValue: transactionId,
              metadata: { otherOrderId: other.id, otherOrderNumber: other.orderNumber, amountCents: current.totalCents, note: "This design was also paid on another order." } as Prisma.InputJsonValue,
            },
          });
          await tx.adminNote.create({
            data: {
              orderId: current.id,
              body: `Possible duplicate payment: this design was also paid on order ${other.orderNumber}. Review for a refund of one of the two payments before producing (Paymob transaction ${transactionId ?? "unknown"}).`,
            },
          });
        }

        // Payment behaviour is unchanged (money received is always recorded);
        // this only makes sure the team notices a payment that arrived for an
        // order they had already cancelled, so it can be refunded or reinstated.
        if (current.status === OrderStatus.CANCELLED) {
          await tx.adminNote.create({
            data: {
              orderId: current.id,
              body: `Payment received after this order was cancelled (Paymob transaction ${transactionId ?? "unknown"}). Review for a refund or reinstate the order.`,
            },
          });
          await tx.adminAuditLog.create({
            data: {
              orderId: current.id,
              action: "PAYMENT_RECEIVED_FOR_CANCELLED_ORDER",
              newValue: transactionId,
              metadata: { note: "A successful Paymob payment arrived for a CANCELLED order." } as Prisma.InputJsonValue,
            },
          });
        }
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

    const attempt = successAfterRefund
      ? null
      : await tx.paymentAttempt.findFirst({
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
          // Existing metadata is kept. A refund records its own id as refundTransactionId and never replaces the charge's.
          metadata: (refunded
            ? refundAttemptMetadata(attempt.metadata, transactionId, paymobOrderId)
            : mergeAttemptMetadata(attempt.metadata, { transactionId, paymobOrderId })) as Prisma.InputJsonValue,
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

  if (processedByConcurrentDelivery) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // After the payment state is durably committed: tell the customer. Fully
  // isolated -- never throws, and is idempotent per order, so a Paymob
  // redelivery can't email twice or fail the webhook.
  // A late success for a REFUNDED order sends no e-mail and touches no bag.
  if (succeeded && !refunded && !successAfterRefund) {
    // No "your order is confirmed" e-mail for a payment that is under review as a possible duplicate.
    if (!duplicateDesignPayment) await sendOrderConfirmationEmail(order.id);
    await removePaidBagItem(order.id);
  }

  return NextResponse.json({ received: true });
}
