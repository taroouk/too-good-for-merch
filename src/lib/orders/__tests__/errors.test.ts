// file: src/lib/orders/__tests__/errors.test.ts
//
// P0-5 regression: a CheckoutError (order currency stale vs current
// StoreSetting/config, order not found, etc.) rejected by the paymob
// create-intent route must never flip a healthy PENDING order to FAILED --
// only a genuine payment-processing failure should. See
// src/lib/orders/errors.ts's orderFailureUpdateFor for the full rationale.
import assert from "node:assert/strict";
import { PaymentStatus } from "@prisma/client";
import { assertApprovedTotal, CheckoutError, orderFailureUpdateFor } from "../errors";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/orders/errors", {
    "a currency/config mismatch (CheckoutError) leaves a PENDING order untouched"() {
      const order = { paymentStatus: PaymentStatus.PENDING };
      const error = new CheckoutError("This order's payment configuration is outdated.", 409);
      assert.equal(orderFailureUpdateFor(order, error), null);
    },

    "a CheckoutError leaves a NEW/UNPAID order untouched too"() {
      const order = { paymentStatus: PaymentStatus.UNPAID };
      const error = new CheckoutError("Order not found.", 404);
      assert.equal(orderFailureUpdateFor(order, error), null);
    },

    "a genuine PaymobError against a PENDING order does mark it FAILED"() {
      const order = { paymentStatus: PaymentStatus.PENDING };
      const error = new Error("Paymob rejected the request: invalid currency");
      const update = orderFailureUpdateFor(order, error);
      assert.ok(update);
      assert.equal(update?.paymentStatus, PaymentStatus.FAILED);
      assert.match(update!.paymentFailureReason, /invalid currency/);
    },

    "an already-PAID order is never overwritten, even by a genuine error"() {
      const order = { paymentStatus: PaymentStatus.PAID };
      const error = new Error("Some late, unrelated error");
      assert.equal(orderFailureUpdateFor(order, error), null);
    },

    "no order (never fetched/created) is a no-op regardless of error type"() {
      assert.equal(orderFailureUpdateFor(null, new CheckoutError("x")), null);
      assert.equal(orderFailureUpdateFor(undefined, new Error("y")), null);
    },

    "approved total: the exact total passes"() {
      assertApprovedTotal(193800, 193800, "EGP");
    },

    "approved total: a total the customer never saw (missing, zero, fractional, text) is refused with 400"() {
      for (const bad of [undefined, null, 0, -5, 1938.5, "193800", Number.NaN]) {
        assert.throws(() => assertApprovedTotal(bad, 193800, "EGP"), (e: unknown) => e instanceof CheckoutError && e.status === 400 && e.code === "TOTAL_CONFIRMATION_REQUIRED");
      }
    },

    "approved total: a different total is refused with 409 PRICE_CHANGED and carries both amounts"() {
      assert.throws(
        () => assertApprovedTotal(193800, 317900, "EGP"),
        (e: unknown) =>
          e instanceof CheckoutError &&
          e.status === 409 &&
          e.code === "PRICE_CHANGED" &&
          e.details?.currentTotalCents === 317900 &&
          e.details?.approvedTotalCents === 193800 &&
          e.details?.currency === "EGP",
      );
    },

    "a PRICE_CHANGED / ORDER_* CheckoutError never marks an order FAILED"() {
      const err = new CheckoutError("changed", 409, "PRICE_CHANGED");
      assert.equal(orderFailureUpdateFor({ paymentStatus: PaymentStatus.PENDING }, err), null);
    },
  });
}
