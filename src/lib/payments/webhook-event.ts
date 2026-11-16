// file: src/lib/payments/webhook-event.ts
//
// Decides what to do with a Paymob webhook delivery by looking at the
// WebhookEvent row for its eventKey. The row is written BEFORE the order is
// updated, so an existing row does not mean "already handled": if the first
// attempt failed half-way (DB timeout, restart), Paymob's retry carries the
// identical payload and must be processed, not dropped as a duplicate.

import { PaymentStatus } from "@prisma/client";

export type WebhookClaim =
  // First time this payload is seen: row created, process it.
  | "new"
  // Row exists but was never processed (earlier attempt failed, or it was only a rejected/forged copy): process it.
  | "retry"
  // Row exists and was already processed (or deliberately closed): acknowledge only.
  | "duplicate";

type EventRow = { processed: boolean; processedAt: Date | null };

export type WebhookEventStore = {
  create(args: { data: { eventKey: string } & Record<string, unknown> }): Promise<unknown>;
  findUnique(args: { where: { eventKey: string } }): Promise<EventRow | null>;
  update(args: { where: { eventKey: string }; data: Record<string, unknown> }): Promise<unknown>;
};

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

export async function claimWebhookEvent(
  store: WebhookEventStore,
  data: { eventKey: string; validSignature: boolean } & Record<string, unknown>,
): Promise<WebhookClaim> {
  try {
    await store.create({ data });
    return "new";
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  const existing = await store.findUnique({ where: { eventKey: data.eventKey } });
  // The row vanished between the failed insert and the read: let this delivery process it.
  if (!existing) return "retry";
  if (existing.processed || existing.processedAt) return "duplicate";

  // Not processed yet: this delivery takes over. Refresh the signature verdict (an earlier copy may have been a
  // forged one for the same payload) and clear the stale error so the row reflects this attempt.
  await store.update({
    where: { eventKey: data.eventKey },
    data: { validSignature: data.validSignature, errorMessage: null },
  });
  return "retry";
}

// True once a delivery has finished this event. Called INSIDE the order-row lock, so a delivery that had to wait for a
// concurrent one sees that one's committed result and can skip the work instead of repeating its side effects.
export async function isWebhookEventProcessed(store: Pick<WebhookEventStore, "findUnique">, eventKey: string) {
  const row = await store.findUnique({ where: { eventKey } });
  return Boolean(row && (row.processed || row.processedAt));
}

// The order columns a processed REFUND event writes. REFUNDED is terminal for webhook processing. refundedAt is when
// the refund FIRST landed (a redelivery or a second refund event keeps it). paymobTransactionId is the ORIGINAL CHARGE
// reference: a refund event never replaces one that is already recorded (the refund's own id is kept in
// PaymentAttempt.metadata.refundTransactionId and the audit log instead). Only when no charge id was ever recorded
// (refund seen before the payment) does the incoming id fill the empty column, exactly as before.
export function refundedOrderUpdate(
  current: { refundedAt: Date | null; paymobTransactionId?: string | null },
  transactionId: string | null,
  now: Date = new Date(),
) {
  return {
    paymentStatus: PaymentStatus.REFUNDED,
    refundedAt: current.refundedAt ?? now,
    paymobTransactionId: current.paymobTransactionId ?? transactionId,
  };
}

// Audit metadata for a REFUND event. `refundTransactionId` is always the refund event's own id. The stored id is only
// reported as the ORIGINAL CHARGE when a charge was recorded (paidAt set); on a refund seen before any payment the stored
// column is empty or may hold a refund id, so the original charge id is null and `chargeRecorded` is false.
export function refundAuditMetadata(
  current: { paymobTransactionId: string | null; paidAt: Date | null },
  refundTransactionId: string | null,
) {
  const storedTransactionId = current.paymobTransactionId ?? null;
  const chargeRecorded = current.paidAt != null;
  return {
    refundTransactionId,
    chargeRecorded,
    storedTransactionId,
    originalChargeTransactionId: chargeRecorded ? storedTransactionId : null,
  };
}

// A successful transaction that arrives for an order that is already REFUNDED. The order is left alone; this says
// what to record. `paidAt` tells whether a successful charge was ever recorded on this order: only then is the stored
// transaction id the ORIGINAL CHARGE id. With no paidAt (a refund seen before any payment) the stored id may be the
// refund's own id, so it is reported as `storedTransactionId` and the original charge id is unknown (null).
// `possibleSecondCharge` is only a possibility (two different ids), never a confirmed second charge.
export function lateSuccessAfterRefund(
  current: { paymobTransactionId: string | null; paidAt: Date | null },
  incomingTransactionId: string | null,
) {
  const storedTransactionId = current.paymobTransactionId ?? null;
  const chargeRecorded = current.paidAt != null;
  return {
    storedTransactionId,
    chargeRecorded,
    originalChargeTransactionId: chargeRecorded ? storedTransactionId : null,
    incomingTransactionId,
    possibleSecondCharge:
      storedTransactionId != null && incomingTransactionId != null && storedTransactionId !== incomingTransactionId,
  };
}

// The admin note for a late success that may be a second charge. Worded as a possibility, and it only calls the stored
// id an "original charge" when a charge was recorded (paidAt set).
export function lateSuccessNoteBody(late: ReturnType<typeof lateSuccessAfterRefund>) {
  const incoming = late.incomingTransactionId ?? "unknown";
  if (late.chargeRecorded) {
    return `A successful Paymob payment (transaction ${incoming}) arrived for this REFUNDED order and is a different transaction from the original charge (${late.storedTransactionId}). The order was left REFUNDED. Check Paymob for a possible second charge.`;
  }
  return `A successful Paymob payment (transaction ${incoming}) arrived for this REFUNDED order. This order was never recorded as paid, so the original charge ID is unknown; the stored transaction ID (${late.storedTransactionId}) may be the refund transaction ID. The order was left REFUNDED. Check Paymob for a possible second charge.`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// PaymentAttempt.metadata after a webhook: whatever is already stored is kept, `patch` is layered on top.
export function mergeAttemptMetadata(existing: unknown, patch: Record<string, unknown>) {
  return { ...asRecord(existing), ...patch };
}

// Metadata for a REFUND event. Everything already stored is kept. The refund's id is recorded ONLY under
// `refundTransactionId`: `transactionId` is the original charge's id, so it is left exactly as it is -- present when a
// charge was recorded, absent when a refund arrives before any payment (the refund id is never copied into it).
export function refundAttemptMetadata(existing: unknown, refundTransactionId: string | null, paymobOrderId: string): Record<string, unknown> {
  return {
    ...asRecord(existing),
    paymobOrderId,
    refundTransactionId,
  };
}

// ---- M1: rejected (bad / missing signature) webhooks --------------------------------------------------------------
//
// A request whose HMAC does not verify is never stored with its payload: anyone on the internet can send one, so storing
// them lets a caller fill the table with up to 256 KB rows. The admin dashboard and system-health still need a signal that
// signatures are being rejected (a wrong PAYMOB_HMAC_SECRET looks exactly like this and would otherwise be invisible), so
// ONE small marker row is kept per reason per UTC hour: a deterministic eventKey makes every further rejection in that hour
// a no-op unique violation. At most (reasons x 24) rows per day, whatever the traffic, and no attacker-controlled data in them.
export type WebhookRejectionReason = "missing_secret" | "missing_signature" | "bad_signature";

export function rejectedWebhookEventKey(reason: WebhookRejectionReason, now: Date = new Date()) {
  const hour = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH (UTC)
  return `rejected:${reason}:${hour}`;
}

export function webhookRejectionReason(secretConfigured: boolean, signature: string | null): WebhookRejectionReason {
  if (!secretConfigured) return "missing_secret";
  if (!signature) return "missing_signature";
  return "bad_signature";
}

// Best effort: never throws, so a database problem cannot turn the 401 into a 500.
export async function recordRejectedWebhook(
  store: Pick<WebhookEventStore, "create">,
  reason: WebhookRejectionReason,
  now: Date = new Date(),
): Promise<"recorded" | "already-recorded" | "failed"> {
  try {
    await store.create({
      data: {
        eventKey: rejectedWebhookEventKey(reason, now),
        eventType: "REJECTED",
        transactionId: null,
        validSignature: false,
        payload: { rejected: true, reason },
        errorMessage: `Invalid HMAC signature (${reason})`,
      },
    });
    return "recorded";
  } catch (error) {
    return isUniqueViolation(error) ? "already-recorded" : "failed";
  }
}

// ---- Order binding -------------------------------------------------------------------------------------------------
//
// Which order does a verified webhook belong to? Only the HMAC-SIGNED Paymob order id (`order.id`) can answer that: it is one of
// the fields the signature covers. `order.merchant_order_id` is NOT signed, so anyone holding one genuine signed callback could
// rewrite it. It is therefore never used to find an order, only as a consistency check on the order the signed id already
// identified. The signed id is matched against the Paymob order ids this app persisted when it created the payment: the order's
// current `paymobOrderId` AND every earlier attempt's `externalId` (a customer may still pay on an older, not yet expired link).
export type OrderBindingProblem = "missing_signed_order_id" | "unknown_signed_order_id" | "ambiguous_signed_order_id" | "order_identifier_conflict";

export const ORDER_BINDING_MESSAGES: Record<OrderBindingProblem, string> = {
  missing_signed_order_id: "Webhook has no signed Paymob order id",
  unknown_signed_order_id: "Unknown Paymob order id",
  ambiguous_signed_order_id: "Paymob order id matches more than one order",
  order_identifier_conflict: "Signed Paymob order id conflicts with the merchant order reference",
};

// The signed Paymob order id of a transaction object: `order.id` (object form) or `order` (a bare number).
export function signedPaymobOrderId(object: Record<string, unknown>): string {
  const order = object.order;
  if (order && typeof order === "object" && !Array.isArray(order)) {
    const id = (order as Record<string, unknown>).id;
    return id == null ? "" : String(id);
  }
  return typeof order === "number" || typeof order === "string" ? String(order) : "";
}

// `candidates` are the orders the signed id matched in the database (at most two are ever needed). `merchantOrderBase` is the
// unsigned merchant_order_id with any retry suffix removed, or "" when absent.
export function checkOrderBinding(
  signedId: string,
  candidates: Array<{ orderNumber: string }>,
  merchantOrderBase: string,
): { ok: true; index: 0 } | { ok: false; problem: OrderBindingProblem } {
  if (!signedId) return { ok: false, problem: "missing_signed_order_id" };
  if (candidates.length === 0) return { ok: false, problem: "unknown_signed_order_id" };
  if (candidates.length > 1) return { ok: false, problem: "ambiguous_signed_order_id" };
  if (merchantOrderBase && merchantOrderBase !== candidates[0].orderNumber) return { ok: false, problem: "order_identifier_conflict" };
  return { ok: true, index: 0 };
}
