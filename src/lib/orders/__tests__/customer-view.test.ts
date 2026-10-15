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
      const out = itemAmountsInChargedCurrency(items, { subtotalCents: 4995, canonicalTotalUsdCents: 999, exchangeRateUsed: 5 });
      assert.equal(out.reduce((s, i) => s + i.totalCents, 0), 4995);
      const legacy = itemAmountsInChargedCurrency(items, { subtotalCents: 999, canonicalTotalUsdCents: null, exchangeRateUsed: null });
      assert.deepEqual(legacy.map((i) => i.totalCents), [333, 666]);
    },
  });
}
