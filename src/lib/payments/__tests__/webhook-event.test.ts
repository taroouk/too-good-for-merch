// file: src/lib/payments/__tests__/webhook-event.test.ts
//
// Regression test for P1-1: a Paymob webhook whose first processing attempt fails must be processed when Paymob
// redelivers it, instead of being swallowed as a "duplicate".
//
// WHAT THIS COVERS: the claim decision (claimWebhookEvent, the exact function the route calls) driven through a
// small in-memory store that behaves like the unique `eventKey` column, plus a mini pipeline that mirrors the route's
// order of operations (claim -> transactional update -> mark processed -> confirmation email after commit). It
// uses the real classifySuccessfulPayment. WHAT IT DOES NOT COVER: the Next.js route handler itself, PostgreSQL, or
// Paymob. The email is a counter guarded by the same "claim the send once" rule as sendOrderConfirmationEmail.
import assert from "node:assert/strict";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { classifySuccessfulPayment } from "../paymob";
import { claimWebhookEvent, isWebhookEventProcessed, refundedOrderUpdate, type WebhookEventStore } from "../webhook-event";
import { runSuite } from "../../../testing/test-harness";

type Row = { eventKey: string; processed: boolean; processedAt: Date | null; validSignature: boolean; errorMessage: string | null };

function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed on eventKey"), { code: "P2002" });
}

function makeStore(): WebhookEventStore & { rows: Map<string, Row> } {
  const rows = new Map<string, Row>();
  return {
    rows,
    async create({ data }) {
      if (rows.has(data.eventKey)) throw uniqueViolation();
      rows.set(data.eventKey, {
        eventKey: data.eventKey,
        processed: false,
        processedAt: null,
        validSignature: Boolean(data.validSignature),
        errorMessage: null,
      });
      return {};
    },
    async findUnique({ where }) {
      return rows.get(where.eventKey) ?? null;
    },
    async update({ where, data }) {
      Object.assign(rows.get(where.eventKey)!, data);
      return {};
    },
  };
}

// Mirrors the route: claim, (maybe failing) transactional order update, mark processed, email after commit.
function makeShop() {
  const store = makeStore();
  const order = {
    paymentStatus: PaymentStatus.UNPAID as PaymentStatus,
    status: OrderStatus.NEW as OrderStatus,
    paidAt: null as Date | null,
    paymobTransactionId: null as string | null,
    confirmationEmailSentAt: null as Date | null,
  };
  const emails: string[] = [];
  let failNextTransaction = false;

  async function deliver(eventKey: string, transactionId: string) {
    const claim = await claimWebhookEvent(store, { eventKey, validSignature: true });
    if (claim === "duplicate") return { status: 200, claim, duplicate: true };

    try {
      // the route's prisma.$transaction: either everything below commits or nothing does
      if (failNextTransaction) {
        failNextTransaction = false;
        throw new Error("simulated DB timeout inside the transaction");
      }
      const classification = classifySuccessfulPayment(order, transactionId);
      if (!classification.isDuplicateCharge) Object.assign(order, classification.update);
      const row = store.rows.get(eventKey)!;
      row.processed = true;
      row.processedAt = new Date();
    } catch {
      return { status: 500, claim, duplicate: false };
    }

    // after commit; same once-only claim as sendOrderConfirmationEmail
    if (order.paymentStatus === PaymentStatus.PAID && !order.confirmationEmailSentAt) {
      order.confirmationEmailSentAt = new Date();
      emails.push("order-confirmation");
    }
    return { status: 200, claim, duplicate: false };
  }

  return { store, order, emails, deliver, failNext: () => (failNextTransaction = true) };
}

// Two simultaneous deliveries of the SAME event. `lock` stands in for the route's `SELECT ... FOR UPDATE` on the order
// row (the second delivery waits until the first commits); everything after it mirrors the route's transaction body.
function makeConcurrentShop(kind: "success" | "refund") {
  const store = makeStore();
  const order = {
    paymentStatus: (kind === "refund" ? PaymentStatus.PAID : PaymentStatus.UNPAID) as PaymentStatus,
    status: OrderStatus.PAID as OrderStatus,
    paidAt: null as Date | null,
    refundedAt: null as Date | null,
    paymobTransactionId: "tx-orig" as string | null,
    confirmationEmailSentAt: null as Date | null,
  };
  const sideEffects = { adminNotes: 0, auditRows: 0, emails: 0, refundWrites: 0 };
  let tail: Promise<unknown> = Promise.resolve();
  const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };

  async function deliver(eventKey: string, transactionId: string, guard: boolean) {
    const claim = await claimWebhookEvent(store, { eventKey, validSignature: true });
    if (claim === "duplicate") return "duplicate" as const;
    const outcome = await withLock(async () => {
      await Promise.resolve(); // yield, as a real DB round trip would
      if (guard && (await isWebhookEventProcessed(store, eventKey))) return "skipped" as const;
      if (kind === "refund") {
        Object.assign(order, refundedOrderUpdate(order, transactionId));
        sideEffects.refundWrites += 1;
      } else {
        const c = classifySuccessfulPayment(order, transactionId);
        if (!c.isDuplicateCharge) Object.assign(order, c.update);
        // the route's "this design was also paid on another order" flag: one note + one audit row per processing
        sideEffects.adminNotes += 1;
        sideEffects.auditRows += 1;
      }
      const row = store.rows.get(eventKey)!;
      row.processed = true;
      row.processedAt = new Date();
      return "processed" as const;
    });
    if (outcome === "skipped") return "duplicate" as const;
    if (kind === "success" && !order.confirmationEmailSentAt) {
      order.confirmationEmailSentAt = new Date();
      sideEffects.emails += 1;
    }
    return outcome;
  }
  return { store, order, sideEffects, deliver };
}

export async function runAll() {
  return runSuite("lib/payments/webhook-event", {
    async "first delivery inserts the event and reports it as new"() {
      const store = makeStore();
      assert.equal(await claimWebhookEvent(store, { eventKey: "k", validSignature: true }), "new");
      assert.equal(store.rows.size, 1);
    },

    async "REGRESSION: failed first attempt, Paymob redelivers the same event -> processed, order PAID, one email"() {
      const shop = makeShop();
      shop.failNext();

      const first = await shop.deliver("evt-1", "tx-100");
      assert.equal(first.status, 500, "the failed attempt answers 500 so Paymob retries");
      assert.equal(first.claim, "new");
      assert.equal(shop.order.paymentStatus, PaymentStatus.UNPAID, "nothing was committed");
      assert.equal(shop.store.rows.get("evt-1")!.processed, false);
      assert.equal(shop.emails.length, 0);

      const second = await shop.deliver("evt-1", "tx-100");
      assert.equal(second.status, 200);
      assert.equal(second.claim, "retry", "the unprocessed event is taken over, not treated as a duplicate");
      assert.equal(second.duplicate, false);
      assert.equal(shop.order.paymentStatus, PaymentStatus.PAID);
      assert.equal(shop.order.status, OrderStatus.PAID);
      assert.equal(shop.order.paymobTransactionId, "tx-100");
      assert.equal(shop.store.rows.get("evt-1")!.processed, true);
      assert.deepEqual(shop.emails, ["order-confirmation"], "exactly one confirmation email");
    },

    async "once processed, a further redelivery is a duplicate and sends nothing more"() {
      const shop = makeShop();
      shop.failNext();
      await shop.deliver("evt-1", "tx-100");
      await shop.deliver("evt-1", "tx-100");

      const third = await shop.deliver("evt-1", "tx-100");
      assert.equal(third.claim, "duplicate");
      assert.equal(third.duplicate, true);
      assert.equal(shop.order.paymentStatus, PaymentStatus.PAID);
      assert.equal(shop.emails.length, 1);
    },

    async "a normal successful first delivery followed by a redelivery is still a duplicate"() {
      const shop = makeShop();
      const first = await shop.deliver("evt-2", "tx-200");
      assert.equal(first.claim, "new");
      const again = await shop.deliver("evt-2", "tx-200");
      assert.equal(again.claim, "duplicate");
      assert.equal(shop.emails.length, 1);
    },

    async "a row closed with processedAt only (e.g. order not found) is a duplicate"() {
      const store = makeStore();
      await claimWebhookEvent(store, { eventKey: "k", validSignature: true });
      store.rows.get("k")!.processedAt = new Date();
      assert.equal(await claimWebhookEvent(store, { eventKey: "k", validSignature: true }), "duplicate");
    },

    async "a forged copy (bad signature) cannot block the genuine delivery of the same payload"() {
      const store = makeStore();
      assert.equal(await claimWebhookEvent(store, { eventKey: "k", validSignature: false }), "new");
      store.rows.get("k")!.errorMessage = "Invalid HMAC signature";

      assert.equal(await claimWebhookEvent(store, { eventKey: "k", validSignature: true }), "retry");
      const row = store.rows.get("k")!;
      assert.equal(row.validSignature, true);
      assert.equal(row.errorMessage, null);
    },

    async "CONCURRENT: the same success event delivered twice at once -> processed once, one note, one audit row, one email"() {
      const shop = makeConcurrentShop("success");
      const results = await Promise.all([
        shop.deliver("evt-c", "tx-300", true),
        shop.deliver("evt-c", "tx-300", true),
        shop.deliver("evt-c", "tx-300", true),
      ]);
      assert.equal(results.filter((r) => r === "processed").length, 1);
      assert.deepEqual(shop.sideEffects, { adminNotes: 1, auditRows: 1, emails: 1, refundWrites: 0 });
      assert.equal(shop.order.paymentStatus, PaymentStatus.PAID);
      assert.equal(shop.order.paymobTransactionId, "tx-300");
    },

    async "CONCURRENT: without the under-lock check the side effects would repeat (guards the test itself)"() {
      const shop = makeConcurrentShop("success");
      await Promise.all([shop.deliver("evt-c", "tx-300", false), shop.deliver("evt-c", "tx-300", false)]);
      assert.equal(shop.sideEffects.adminNotes, 2, "this is the bug the guard prevents");
      assert.equal(shop.sideEffects.emails, 1, "the email claim alone already prevents a second email");
    },

    async "CONCURRENT refund: the same refund event twice -> one write, refundedAt set once and never moved"() {
      const shop = makeConcurrentShop("refund");
      await Promise.all([shop.deliver("evt-r", "tx-ref", true), shop.deliver("evt-r", "tx-ref", true)]);
      assert.equal(shop.sideEffects.refundWrites, 1);
      assert.equal(shop.order.paymentStatus, PaymentStatus.REFUNDED);
      assert.ok(shop.order.refundedAt instanceof Date);
    },

    async "refundedAt is set by the first refund and NOT changed when the refund webhook is redelivered or repeated"() {
      const firstAt = new Date("2026-11-10T10:00:00.000Z");
      const laterAt = new Date("2026-11-12T15:30:00.000Z");
      const order = { refundedAt: null as Date | null };

      const first = refundedOrderUpdate(order, "tx-refund-1", firstAt);
      assert.equal(first.paymentStatus, PaymentStatus.REFUNDED);
      assert.equal(first.refundedAt.getTime(), firstAt.getTime());
      order.refundedAt = first.refundedAt; // what the route persists

      // same refund event redelivered two days later, and a second refund event for the same order
      for (const txId of ["tx-refund-1", "tx-refund-2"]) {
        const again = refundedOrderUpdate(order, txId, laterAt);
        assert.equal(again.paymentStatus, PaymentStatus.REFUNDED);
        assert.equal(again.refundedAt.getTime(), firstAt.getTime(), "refundedAt must keep the first refund time");
        assert.equal(again.paymobTransactionId, txId);
      }
    },

    async "errors other than a unique violation are not swallowed"() {
      const store = makeStore();
      store.create = async () => {
        throw new Error("connection lost");
      };
      await assert.rejects(() => claimWebhookEvent(store, { eventKey: "k", validSignature: true }), /connection lost/);
    },
  });
}
