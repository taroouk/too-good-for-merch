// file: src/lib/orders/__tests__/customer-view.test.ts
import assert from "node:assert/strict";
import {
  customerOrderStatus,
  itemAmountsInChargedCurrency,
  matchesOrderFilter,
  orderTimeline,
  parseOrderFilter,
  type OrderLike,
} from "../customer-view";
import { runSuite } from "../../../testing/test-harness";

const base: OrderLike = {
  status: "NEW",
  paymentStatus: "UNPAID",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  paidAt: null,
  shippedAt: null,
  refundedAt: null,
};
const paid = (extra: Partial<OrderLike> = {}): OrderLike => ({ ...base, paymentStatus: "PAID", status: "PAID", paidAt: new Date("2026-10-01T10:05:00Z"), ...extra });

export async function runAll() {
  return runSuite("orders/customer-view", {
    "status follows payment then fulfilment"() {
      assert.equal(customerOrderStatus(base).key, "awaiting-payment");
      assert.equal(customerOrderStatus({ ...base, paymentStatus: "FAILED" }).key, "payment-failed");
      assert.equal(customerOrderStatus(paid()).key, "confirmed");
      assert.equal(customerOrderStatus(paid({ status: "IN_PRODUCTION" })).key, "in-production");
      assert.equal(customerOrderStatus(paid({ status: "SHIPPED", shippedAt: new Date() })).key, "shipped");
      assert.equal(customerOrderStatus(paid({ status: "COMPLETED" })).key, "delivered");
    },
    "cancelled and refunded win over everything"() {
      assert.equal(customerOrderStatus(paid({ status: "CANCELLED" })).key, "cancelled");
      assert.equal(customerOrderStatus({ ...paid(), paymentStatus: "REFUNDED" }).key, "refunded");
      assert.equal(customerOrderStatus(paid({ refundedAt: new Date() })).key, "refunded");
    },
    "timeline marks done / current / upcoming"() {
      const t = orderTimeline(paid({ status: "IN_PRODUCTION" }))!;
      assert.deepEqual(t.map((s) => s.state), ["done", "done", "done", "current", "upcoming"]);
      assert.equal(orderTimeline(base)![1].state, "current");
      assert.equal(orderTimeline(paid({ status: "COMPLETED" }))!.every((s) => s.state === "done"), true);
      assert.equal(orderTimeline(paid({ status: "CANCELLED" })), null);
    },
    "filters group statuses sensibly"() {
      assert.equal(matchesOrderFilter(base, "unpaid"), true);
      assert.equal(matchesOrderFilter(base, "active"), false);
      assert.equal(matchesOrderFilter(paid(), "active"), true);
      assert.equal(matchesOrderFilter(paid({ status: "COMPLETED" }), "delivered"), true);
      assert.equal(matchesOrderFilter(paid({ status: "CANCELLED" }), "closed"), true);
      assert.equal(parseOrderFilter("nonsense"), "all");
    },
    "item amounts convert at the order's rate and add up to the subtotal"() {
      const items = [
        { quantity: 1, unitPriceCents: 333, totalCents: 333 },
        { quantity: 2, unitPriceCents: 333, totalCents: 666 },
      ];
      const out = itemAmountsInChargedCurrency(items, { subtotalCents: 5000, canonicalTotalUsdCents: 999, exchangeRateUsed: 5 });
      assert.equal(out.reduce((s, i) => s + i.totalCents, 0), 5000);
      assert.equal(out.every((i) => i.totalCents % 100 === 0), true);
      // An older order charged with piastres still adds up to what was paid.
      const old = itemAmountsInChargedCurrency(items, { subtotalCents: 4995, canonicalTotalUsdCents: 999, exchangeRateUsed: 5 });
      assert.equal(old.reduce((s, i) => s + i.totalCents, 0), 4995);
      const legacy = itemAmountsInChargedCurrency(items, { subtotalCents: 999, canonicalTotalUsdCents: null, exchangeRateUsed: null });
      assert.deepEqual(legacy.map((i) => i.totalCents), [333, 666]);
    },

    "a paid order under duplicate review reads 'Payment received — under review', never 'Confirmed'"() {
      const status = customerOrderStatus(paid({ paymentUnderReview: true }));
      assert.equal(status.key, "payment-under-review");
      assert.equal(status.label, "Payment received — under review");
      assert.equal(status.tone, "warning");
      assert.match(status.description, /received your payment/i);
      assert.match(status.description, /reviewing it before production starts/i);
      assert.doesNotMatch(`${status.label} ${status.description}`, /Confirmed/);
    },

    "an ordinary paid order stays 'Confirmed' with the standard sentence"() {
      for (const flag of [undefined, false]) {
        const status = customerOrderStatus(paid({ paymentUnderReview: flag }));
        assert.equal(status.key, "confirmed");
        assert.equal(status.label, "Confirmed");
        assert.equal(status.description, "Payment received. Your order is confirmed.");
      }
    },

    "the review ends when the team moves the order on, cancels it or refunds it (the normal status wins)"() {
      assert.equal(customerOrderStatus(paid({ status: "IN_PRODUCTION", paymentUnderReview: true })).key, "in-production");
      assert.equal(customerOrderStatus(paid({ status: "SHIPPED", paymentUnderReview: true })).key, "shipped");
      assert.equal(customerOrderStatus(paid({ status: "COMPLETED", paymentUnderReview: true })).key, "delivered");
      assert.equal(customerOrderStatus(paid({ status: "CANCELLED", paymentUnderReview: true })).key, "cancelled");
      assert.equal(customerOrderStatus(paid({ paymentStatus: "REFUNDED", paymentUnderReview: true })).key, "refunded");
    },

    "the flag never makes an unpaid or failed order look paid"() {
      assert.equal(customerOrderStatus({ ...base, paymentStatus: "PENDING", paymentUnderReview: true }).key, "awaiting-payment");
      assert.equal(customerOrderStatus({ ...base, paymentStatus: "FAILED", paymentUnderReview: true }).key, "payment-failed");
    },

    "under review: in the 'In progress' filter, and the timeline does not say 'Payment confirmed'"() {
      const order = paid({ paymentUnderReview: true });
      assert.equal(matchesOrderFilter(order, "active"), true);
      assert.equal(matchesOrderFilter(order, "unpaid"), false);
      assert.equal(matchesOrderFilter(order, "closed"), false);
      const labels = (orderTimeline(order) ?? []).map((step) => step.label);
      assert.ok(labels.includes("Payment received — under review"));
      assert.ok(!labels.includes("Payment confirmed"));
      assert.ok((orderTimeline(paid()) ?? []).some((step) => step.label === "Payment confirmed"));
    },
  });
}
