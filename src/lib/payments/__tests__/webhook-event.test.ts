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
import {
  ORDER_BINDING_MESSAGES,
  checkOrderBinding,
  claimWebhookEvent,
  signedPaymobOrderId,
  isWebhookEventProcessed,
  lateSuccessAfterRefund,
  lateSuccessNoteBody,
  mergeAttemptMetadata,
  refundAttemptMetadata,
  refundAuditMetadata,
  recordRejectedWebhook,
  refundedOrderUpdate,
  rejectedWebhookEventKey,
  webhookRejectionReason,
  type WebhookEventStore,
} from "../webhook-event";
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
      if (!classification.isDuplicateCharge && !classification.afterRefund) Object.assign(order, classification.update);
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
        if (!c.isDuplicateCharge && !c.afterRefund) Object.assign(order, c.update);
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
      const order = { refundedAt: null as Date | null, paymobTransactionId: "tx-charge" as string | null };

      const first = refundedOrderUpdate(order, "tx-refund-1", firstAt);
      assert.equal(first.paymentStatus, PaymentStatus.REFUNDED);
      assert.equal(first.refundedAt.getTime(), firstAt.getTime());
      order.refundedAt = first.refundedAt; // what the route persists

      // same refund event redelivered two days later, and a second refund event for the same order
      for (const txId of ["tx-refund-1", "tx-refund-2"]) {
        const again = refundedOrderUpdate(order, txId, laterAt);
        assert.equal(again.paymentStatus, PaymentStatus.REFUNDED);
        assert.equal(again.refundedAt.getTime(), firstAt.getTime(), "refundedAt must keep the first refund time");
        assert.equal(again.paymobTransactionId, "tx-charge", "a refund event never replaces the original charge id");
      }
    },

    async "refund event: the original charge id is kept; an empty charge id (refund before payment) is filled as before"() {
      const withCharge = refundedOrderUpdate({ refundedAt: null, paymobTransactionId: "tx-charge" }, "tx-refund");
      assert.equal(withCharge.paymobTransactionId, "tx-charge");
      assert.equal(withCharge.paymentStatus, PaymentStatus.REFUNDED);
      const refundFirst = refundedOrderUpdate({ refundedAt: null, paymobTransactionId: null }, "tx-refund");
      assert.equal(refundFirst.paymobTransactionId, "tx-refund");
      const noId = refundedOrderUpdate({ refundedAt: null, paymobTransactionId: "tx-charge" }, null);
      assert.equal(noId.paymobTransactionId, "tx-charge");
    },

    async "refundAuditMetadata: paidAt set -> the stored id is the original charge; paidAt null -> the original charge id is null and no refund id is labelled a charge"() {
      const paid = refundAuditMetadata({ paymobTransactionId: "tx-A", paidAt: new Date("2026-11-01T00:00:00Z") }, "tx-R");
      assert.deepEqual(paid, {
        refundTransactionId: "tx-R",
        chargeRecorded: true,
        storedTransactionId: "tx-A",
        originalChargeTransactionId: "tx-A",
      });
      const beforePayment = refundAuditMetadata({ paymobTransactionId: null, paidAt: null }, "tx-R");
      assert.deepEqual(beforePayment, {
        refundTransactionId: "tx-R",
        chargeRecorded: false,
        storedTransactionId: null,
        originalChargeTransactionId: null,
      });
      // a stored id with no paidAt is never promoted to "original charge"
      const odd = refundAuditMetadata({ paymobTransactionId: "tx-X", paidAt: null }, "tx-R");
      assert.equal(odd.originalChargeTransactionId, null);
      assert.equal(odd.storedTransactionId, "tx-X");
      assert.equal(odd.refundTransactionId, "tx-R");
      assert.equal("chargeTransactionId" in odd, false);
    },

    async "lateSuccessAfterRefund (paidAt present): the stored id is the original charge; same id is not a second charge, a different id is a POSSIBLE one"() {
      const paidAt = new Date("2026-11-01T00:00:00Z");
      assert.deepEqual(lateSuccessAfterRefund({ paymobTransactionId: "tx-A", paidAt }, "tx-A"), {
        storedTransactionId: "tx-A",
        chargeRecorded: true,
        originalChargeTransactionId: "tx-A",
        incomingTransactionId: "tx-A",
        possibleSecondCharge: false,
      });
      const diff = lateSuccessAfterRefund({ paymobTransactionId: "tx-A", paidAt }, "tx-B");
      assert.equal(diff.possibleSecondCharge, true);
      assert.equal(diff.originalChargeTransactionId, "tx-A");
      assert.equal(lateSuccessAfterRefund({ paymobTransactionId: null, paidAt }, "tx-B").possibleSecondCharge, false);
      assert.equal(lateSuccessAfterRefund({ paymobTransactionId: "tx-A", paidAt }, null).possibleSecondCharge, false);
    },

    async "lateSuccessAfterRefund (paidAt null): the original charge id is unknown and the stored id is never labelled as the charge"() {
      const late = lateSuccessAfterRefund({ paymobTransactionId: "tx-refund", paidAt: null }, "tx-B");
      assert.equal(late.chargeRecorded, false);
      assert.equal(late.originalChargeTransactionId, null);
      assert.equal(late.storedTransactionId, "tx-refund");
      assert.equal(late.possibleSecondCharge, true, "still only a possibility, flagged as before");
      assert.equal(lateSuccessAfterRefund({ paymobTransactionId: "tx-refund", paidAt: null }, "tx-refund").possibleSecondCharge, false);
      assert.equal(lateSuccessAfterRefund({ paymobTransactionId: null, paidAt: null }, "tx-B").originalChargeTransactionId, null);
    },

    async "lateSuccessNoteBody: names an original charge only when paidAt is set; otherwise says it is unknown; always 'possible', never asserts a second charge"() {
      const paid = lateSuccessNoteBody(lateSuccessAfterRefund({ paymobTransactionId: "tx-A", paidAt: new Date() }, "tx-B"));
      assert.match(paid, /different transaction from the original charge \(tx-A\)/);
      assert.match(paid, /possible second charge/);
      const unpaid = lateSuccessNoteBody(lateSuccessAfterRefund({ paymobTransactionId: "tx-R", paidAt: null }, "tx-B"));
      assert.match(unpaid, /never recorded as paid/);
      assert.match(unpaid, /original charge ID is unknown/);
      assert.match(unpaid, /stored transaction ID \(tx-R\) may be the refund transaction ID/);
      assert.doesNotMatch(unpaid, /from the original charge \(/);
      assert.match(unpaid, /possible second charge/);
      for (const text of [paid, unpaid]) assert.doesNotMatch(text, /was charged twice|second charge (occurred|was made)|confirmed/i);
    },

    async "mergeAttemptMetadata keeps every existing key and layers the patch on top"() {
      const existing = { transactionId: "tx-charge", paymobOrderId: "po1", custom: "keep-me", nested: { a: 1 } };
      assert.deepEqual(mergeAttemptMetadata(existing, { transactionId: "tx-2", paymobOrderId: "po1" }), {
        transactionId: "tx-2",
        paymobOrderId: "po1",
        custom: "keep-me",
        nested: { a: 1 },
      });
      assert.deepEqual(mergeAttemptMetadata("junk", { transactionId: "t" }), { transactionId: "t" });
    },

    async "refundAttemptMetadata: payment then refund -> the charge transactionId stays, the refund id goes to refundTransactionId only"() {
      const afterPayment = { transactionId: "tx-charge", paymobOrderId: "po1" };
      assert.deepEqual(refundAttemptMetadata(afterPayment, "tx-refund", "po1"), {
        transactionId: "tx-charge",
        paymobOrderId: "po1",
        refundTransactionId: "tx-refund",
      });
    },

    async "refundAttemptMetadata: refund BEFORE payment -> no transactionId is invented from the refund id"() {
      const beforePayment = { paymobOrderId: "po1" }; // a PENDING attempt that never recorded a charge
      const result = refundAttemptMetadata(beforePayment, "tx-refund", "po1");
      assert.equal("transactionId" in result, false, "the refund id must not be copied into transactionId");
      assert.deepEqual(result, { paymobOrderId: "po1", refundTransactionId: "tx-refund" });
      // a null refund id never produces a transactionId either
      assert.equal("transactionId" in refundAttemptMetadata(beforePayment, null, "po1"), false);
    },

    async "refundAttemptMetadata: empty / null / junk existing metadata does not throw and records only the refund fields"() {
      for (const existing of [null, undefined, {}, [], "junk", 42]) {
        assert.deepEqual(refundAttemptMetadata(existing, "tx-refund", "po1"), { paymobOrderId: "po1", refundTransactionId: "tx-refund" });
      }
    },

    async "refundAttemptMetadata: extra existing fields (including nested ones) are preserved untouched"() {
      const existing = { transactionId: "tx-charge", custom: "keep-me", nested: { a: 1, b: [1, 2] }, flag: false };
      const result = refundAttemptMetadata(existing, "tx-refund", "po9");
      assert.deepEqual(result, {
        transactionId: "tx-charge",
        custom: "keep-me",
        nested: { a: 1, b: [1, 2] },
        flag: false,
        paymobOrderId: "po9",
        refundTransactionId: "tx-refund",
      });
      assert.deepEqual(existing, { transactionId: "tx-charge", custom: "keep-me", nested: { a: 1, b: [1, 2] }, flag: false }, "input is not mutated");
      // a second refund event replaces only refundTransactionId
      assert.equal(refundAttemptMetadata(result, "tx-refund-2", "po9").refundTransactionId, "tx-refund-2");
      assert.equal(refundAttemptMetadata(result, "tx-refund-2", "po9").transactionId, "tx-charge");
    },

    async "M1: rejected webhooks write ONE small marker row per reason per UTC hour, never the payload, however many arrive"() {
      const store = makeStore();
      const hour = new Date("2026-11-14T10:15:00Z");
      const results: string[] = [];
      for (let i = 0; i < 50; i++) results.push(await recordRejectedWebhook(store, "bad_signature", new Date(hour.getTime() + i * 1000)));
      assert.equal(results[0], "recorded");
      assert.ok(results.slice(1).every((r) => r === "already-recorded"));
      assert.equal(store.rows.size, 1, "50 forged requests in one hour -> one row");
      assert.equal(await recordRejectedWebhook(store, "missing_signature", hour), "recorded", "a different reason gets its own marker");
      assert.equal(await recordRejectedWebhook(store, "bad_signature", new Date("2026-11-14T11:00:00Z")), "recorded", "the next hour gets a new one");
      assert.equal(store.rows.size, 3);
      assert.equal(rejectedWebhookEventKey("bad_signature", hour), "rejected:bad_signature:2026-11-14T10");
    },

    async "M1: the rejection marker carries no request data and is flagged as rejected"() {
      const seen: Array<Record<string, unknown>> = [];
      const store = { async create({ data }: { data: Record<string, unknown> }) { seen.push(data); return {}; } };
      await recordRejectedWebhook(store as never, "missing_secret");
      assert.equal(seen[0].validSignature, false);
      assert.equal(seen[0].eventType, "REJECTED");
      assert.deepEqual(seen[0].payload, { rejected: true, reason: "missing_secret" });
      assert.equal(seen[0].transactionId, null);
    },

    async "M1: a database failure while recording a rejection never throws (the caller still answers 401)"() {
      const store = { async create() { throw new Error("connection lost"); } };
      assert.equal(await recordRejectedWebhook(store as never, "bad_signature"), "failed");
    },

    async "M1: rejection reasons: no secret configured, no signature sent, wrong signature"() {
      assert.equal(webhookRejectionReason(false, "x".repeat(128)), "missing_secret");
      assert.equal(webhookRejectionReason(true, null), "missing_signature");
      assert.equal(webhookRejectionReason(true, ""), "missing_signature");
      assert.equal(webhookRejectionReason(true, "a".repeat(128)), "bad_signature");
    },

    async "order binding: the signed Paymob order id is read from order.id (object) or order (bare number)"() {
      assert.equal(signedPaymobOrderId({ order: { id: 4242, merchant_order_id: "TGFM-1" } }), "4242");
      assert.equal(signedPaymobOrderId({ order: 4242 }), "4242");
      assert.equal(signedPaymobOrderId({ order: { merchant_order_id: "TGFM-1" } }), "", "merchant_order_id is never promoted to an id");
      assert.equal(signedPaymobOrderId({ order: null }), "");
      assert.equal(signedPaymobOrderId({}), "");
      assert.equal(signedPaymobOrderId({ order: [1, 2] }), "");
    },

    async "order binding: a valid signed id, with a consistent or absent merchant reference, resolves"() {
      assert.deepEqual(checkOrderBinding("9001", [{ orderNumber: "TGFM-1" }], "TGFM-1"), { ok: true, index: 0 });
      assert.deepEqual(checkOrderBinding("9001", [{ orderNumber: "TGFM-1" }], ""), { ok: true, index: 0 });
    },

    async "order binding: a forged merchant_order_id naming ANOTHER customer's order is a conflict, not a match"() {
      // the signed id belongs to the attacker's order TGFM-2; the unsigned merchant reference says TGFM-1 (the victim)
      const r = checkOrderBinding("9002", [{ orderNumber: "TGFM-2" }], "TGFM-1");
      assert.deepEqual(r, { ok: false, problem: "order_identifier_conflict" });
    },

    async "order binding: unknown, missing and ambiguous signed ids never resolve, whatever the merchant reference says"() {
      assert.deepEqual(checkOrderBinding("777", [], "TGFM-1"), { ok: false, problem: "unknown_signed_order_id" });
      assert.deepEqual(checkOrderBinding("", [], "TGFM-1"), { ok: false, problem: "missing_signed_order_id" });
      assert.deepEqual(checkOrderBinding("", [{ orderNumber: "TGFM-1" }], "TGFM-1"), { ok: false, problem: "missing_signed_order_id" }, "even if a row were somehow supplied");
      assert.deepEqual(checkOrderBinding("9001", [{ orderNumber: "TGFM-1" }, { orderNumber: "TGFM-2" }], "TGFM-1"), { ok: false, problem: "ambiguous_signed_order_id" });
    },

    async "order binding: every refusal has a distinct admin-facing message"() {
      const messages = Object.values(ORDER_BINDING_MESSAGES);
      assert.equal(new Set(messages).size, messages.length);
      assert.ok(messages.every((m) => m.length > 10));
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
