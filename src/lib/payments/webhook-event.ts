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

// The order columns a processed REFUND event writes. refundedAt is when the refund FIRST landed: a redelivery or a
// second refund event for an already refunded order keeps it (the route calls this with the row read under the lock).
export function refundedOrderUpdate(current: { refundedAt: Date | null }, transactionId: string | null, now: Date = new Date()) {
  return {
    paymentStatus: PaymentStatus.REFUNDED,
    refundedAt: current.refundedAt ?? now,
    paymobTransactionId: transactionId,
  };
}
