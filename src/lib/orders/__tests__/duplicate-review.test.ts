// file: src/lib/orders/__tests__/duplicate-review.test.ts
import assert from "node:assert/strict";
import { adminReviewNotice, duplicatePaymentHealthCheck, duplicatePaymentNotice, duplicateReviewIds, DUPLICATE_DESIGN_ACTION, isLaterDuplicatePayment, loadDuplicateReviewIds, type ReviewableOrder } from "../duplicate-review";
import { runSuite } from "../../../testing/test-harness";

const T = (minutes: number) => new Date(Date.UTC(2026, 10, 9, 10, 0, 0) + minutes * 60_000);
const order = (id: string, extra: Partial<ReviewableOrder> = {}): ReviewableOrder => ({ id, buildId: "B", createdAt: T(0), paidAt: null, status: "NEW", paymentStatus: "PENDING", ...extra });
const paid = (id: string, paidMin: number, extra: Partial<ReviewableOrder> = {}) => order(id, { status: "PAID", paymentStatus: "PAID", paidAt: T(paidMin), ...extra });

export async function runAll() {
  return runSuite("lib/orders/duplicate-review (customer sees 'under review', money state untouched)", {
    "of two orders open at the same time for one design, the LATER payment is the one under review"() {
      const first = paid("a", 10, { createdAt: T(0) });
      const second = paid("b", 20, { createdAt: T(1) });
      assert.equal(isLaterDuplicatePayment(second, [first, second]), true);
      assert.equal(isLaterDuplicatePayment(first, [first, second]), false);
      assert.deepEqual([...duplicateReviewIds([first, second], [first, second], new Set())], ["b"]);
    },

    "works from the audit entry alone (no other order needed) and from the payment facts alone (audit lost)"() {
      const lone = paid("x", 10);
      assert.deepEqual([...duplicateReviewIds([lone], [lone], new Set(["x"]))], ["x"], "audit only");
      const first = paid("a", 10); const second = paid("b", 20, { createdAt: T(2) });
      assert.deepEqual([...duplicateReviewIds([second], [first, second], new Set())], ["b"], "derived only");
    },

    "a deliberate RE-ORDER (created after the other was paid) is not under review"() {
      const first = paid("a", 10, { createdAt: T(0) });
      const reorder = paid("c", 90, { createdAt: T(60) });
      assert.equal(isLaterDuplicatePayment(reorder, [first, reorder]), false);
      assert.equal(duplicateReviewIds([reorder], [first, reorder], new Set()).size, 0);
    },

    "different designs never match; a bag order matches through its items' buildIds"() {
      const a = paid("a", 10, { buildId: "X" }); const b = paid("b", 20, { buildId: "Y", createdAt: T(1) });
      assert.equal(isLaterDuplicatePayment(b, [a, b]), false);
      const bag = paid("bag", 10, { buildId: null, items: [{ preview: { buildId: "X" } }, { preview: { buildId: "Z" } }] });
      const single = paid("one", 20, { buildId: "Z", createdAt: T(1) });
      assert.equal(isLaterDuplicatePayment(single, [bag, single]), true);
    },

    "simultaneous payments: exactly one of the two is under review (id decides the tie)"() {
      const a = paid("a", 10, { createdAt: T(0) }); const b = paid("b", 10, { createdAt: T(0) });
      assert.deepEqual([...duplicateReviewIds([a, b], [a, b], new Set())], ["b"]);
    },

    "only a freshly paid order (status PAID) can be under review; production, cancel and refund end it"() {
      const other = paid("o", 5);
      for (const [status, paymentStatus] of [["IN_PRODUCTION", "PAID"], ["SHIPPED", "PAID"], ["COMPLETED", "PAID"], ["CANCELLED", "PAID"], ["NEW", "PENDING"], ["PAID", "REFUNDED"]] as const) {
        const flagged = order("f", { status, paymentStatus, paidAt: T(20), createdAt: T(1) });
        assert.equal(duplicateReviewIds([flagged], [other, flagged], new Set(["f"])).size, 0, `${status}/${paymentStatus}`);
      }
    },

    async "a failed lookup never breaks the page: the audit part still applies, nothing is thrown, nothing is written"() {
      const logged: string[] = [];
      const flaggedOrder = paid("f", 20, { createdAt: T(1) });
      const ids = await loadDuplicateReviewIds(
        { audits: async () => ["f"], paidOrders: async () => { throw new Error("db down"); } },
        [flaggedOrder],
        (message) => logged.push(message),
      );
      assert.deepEqual([...ids], ["f"]);
      assert.deepEqual(logged, ["duplicate-review: paid-orders lookup failed"]);
      const noAudit = await loadDuplicateReviewIds(
        { audits: async () => { throw new Error("db down"); }, paidOrders: async () => [paid("a", 10), flaggedOrder] },
        [flaggedOrder],
        () => {},
      );
      assert.deepEqual([...noAudit], ["f"], "the derived rule still flags it when the audit lookup fails");
      const bothDown = await loadDuplicateReviewIds({ audits: async () => { throw new Error("x"); }, paidOrders: async () => { throw new Error("y"); } }, [flaggedOrder], () => {});
      assert.equal(bothDown.size, 0, "with no information the page falls back to the ordinary status; payment data is never modified here");
    },

    "orders that are not candidates are not even looked up"() {
      let calls = 0;
      return loadDuplicateReviewIds({ audits: async () => { calls += 1; return []; }, paidOrders: async () => { calls += 1; return []; } }, [order("n")], () => {}).then((ids) => {
        assert.equal(ids.size, 0);
        assert.equal(calls, 0);
      });
    },

    "admin notice: shown when the entry exists, names the other order, absent otherwise"() {
      assert.equal(duplicatePaymentNotice([{ action: "EMAIL_FAILED", metadata: {} }]), null);
      assert.deepEqual(duplicatePaymentNotice([{ action: DUPLICATE_DESIGN_ACTION, metadata: { otherOrderNumber: "TGFM-1", otherOrderId: "o1" } }]), { otherOrderNumber: "TGFM-1", otherOrderId: "o1" });
      assert.deepEqual(duplicatePaymentNotice([{ action: DUPLICATE_DESIGN_ACTION, metadata: null }]), { otherOrderNumber: null, otherOrderId: null });
    },

    "admin review notice: from the order's own entry, or from the payment facts alone; unresolved only while PAID/PAID"() {
      const meta = { otherOrderNumber: "TGFM-5031", otherOrderId: "o1" };
      assert.deepEqual(adminReviewNotice({ status: "PAID", paymentStatus: "PAID" }, { metadata: meta }, false), { unresolved: true, otherOrderNumber: "TGFM-5031", otherOrderId: "o1" });
      assert.deepEqual(adminReviewNotice({ status: "PAID", paymentStatus: "PAID" }, null, true), { unresolved: true, otherOrderNumber: null, otherOrderId: null }, "audit lost: still flagged");
      assert.equal(adminReviewNotice({ status: "PAID", paymentStatus: "PAID" }, null, false), null);
      assert.equal(adminReviewNotice({ status: "IN_PRODUCTION", paymentStatus: "PAID" }, { metadata: meta }, false)?.unresolved, false, "kept as a record after the team moved it on");
      assert.equal(adminReviewNotice({ status: "CANCELLED", paymentStatus: "PAID" }, { metadata: meta }, true)?.unresolved, false);
    },

    "system health row (the existing admin signal): red while any flagged order waits, green when none, link to the audit entries"() {
      const red = duplicatePaymentHealthCheck(2);
      assert.equal(red.level, "fail");
      assert.match(red.detail, /2 paid order\(s\) are held for review/);
      assert.match(red.detail, /nothing is refunded or cancelled automatically/);
      assert.equal(red.href, "/admin/audit?action=PAYMOB_DUPLICATE_DESIGN_PAYMENT");
      assert.equal(duplicatePaymentHealthCheck(0).level, "ok");
      assert.equal(duplicatePaymentHealthCheck(1).id, "duplicate-payments");
    },
  });
}
