// file: src/lib/orders/__tests__/payable.test.ts
import assert from "node:assert/strict";
import { isLiveAttempt, isReusableOpenOrder, orderPayability, PAYABLE_ORDER_STATUS, PAYABLE_PAYMENT_STATUSES, PAYMENT_IN_FLIGHT_LIVE_MS, PAYMENT_LINK_LIVE_MS, termsConsentStatus, competingPaymentMessage } from "../payable";
import { runSuite } from "../../../testing/test-harness";

const STATUSES = ["NEW", "PAID", "IN_PRODUCTION", "SHIPPED", "COMPLETED", "CANCELLED"];
const PAYMENTS = ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"];

export async function runAll() {
  return runSuite("lib/orders/payable", {
    "a new order that is unpaid, pending or failed can be paid / retried"() {
      for (const paymentStatus of ["UNPAID", "PENDING", "FAILED"]) assert.deepEqual(orderPayability({ status: "NEW", paymentStatus }), { ok: true });
    },

    "a paid order is refused (even when its status is odd)"() {
      for (const status of STATUSES) {
        const verdict = orderPayability({ status, paymentStatus: "PAID" });
        assert.equal(verdict.ok, false);
        assert.equal(!verdict.ok && verdict.code, "ORDER_ALREADY_PAID");
      }
    },

    "a refunded order is refused and never reopened"() {
      for (const status of STATUSES) {
        const verdict = orderPayability({ status, paymentStatus: "REFUNDED" });
        assert.equal(!verdict.ok && verdict.code, "ORDER_REFUNDED");
      }
    },

    "a cancelled order is refused whatever its payment status (this was the audit gap: CANCELLED + UNPAID)"() {
      for (const paymentStatus of ["UNPAID", "PENDING", "FAILED"]) {
        const verdict = orderPayability({ status: "CANCELLED", paymentStatus });
        assert.equal(verdict.ok, false);
        assert.equal(!verdict.ok && verdict.code, "ORDER_CANCELLED");
      }
    },

    "an unpaid order that already moved on (in production, shipped, completed) is refused"() {
      for (const status of ["IN_PRODUCTION", "SHIPPED", "COMPLETED", "PAID"]) {
        const verdict = orderPayability({ status, paymentStatus: "UNPAID" });
        assert.equal(!verdict.ok && verdict.code, "ORDER_NOT_PAYABLE");
      }
    },

    "exhaustive: exactly NEW x {UNPAID, PENDING, FAILED} is payable, nothing else"() {
      for (const status of STATUSES) {
        for (const paymentStatus of PAYMENTS) {
          const expected = status === PAYABLE_ORDER_STATUS && (PAYABLE_PAYMENT_STATUSES as readonly string[]).includes(paymentStatus);
          assert.equal(orderPayability({ status, paymentStatus }).ok, expected, `${status}/${paymentStatus}`);
          assert.equal(isReusableOpenOrder({ status, paymentStatus }), expected);
        }
      }
    },

    "every refusal has a customer-facing message"() {
      for (const status of STATUSES) for (const paymentStatus of PAYMENTS) {
        const verdict = orderPayability({ status, paymentStatus });
        if (!verdict.ok) assert.ok(verdict.message.length > 20 && !/prisma|undefined/i.test(verdict.message));
      }
    },

    "a payment link counts as live for about an hour (Paymob's payment key lifetime is at most 3600 s), not longer"() {
      const now = Date.now();
      const attempt = (status: string, paymentUrl: string | null, ageMs: number) => ({ status, paymentUrl, createdAt: new Date(now - ageMs) });
      assert.equal(PAYMENT_LINK_LIVE_MS > 3600 * 1000, true, "must cover the whole key lifetime");
      assert.equal(isLiveAttempt(attempt("PENDING", "https://x.invalid/pay", 5 * 60 * 1000), now), true);
      assert.equal(isLiveAttempt(attempt("PENDING", "https://x.invalid/pay", 59 * 60 * 1000), now), true);
      assert.equal(isLiveAttempt(attempt("PENDING", "https://x.invalid/pay", 62 * 60 * 1000), now), false);
      assert.equal(isLiveAttempt(attempt("PENDING", null, 1000), now), false, "no link, nothing to pay");
    },

    "an attempt still being created counts briefly; failed or succeeded attempts never count as a live link"() {
      const now = Date.now();
      const attempt = (status: string, ageMs: number) => ({ status, paymentUrl: "https://x.invalid/pay", createdAt: new Date(now - ageMs) });
      assert.equal(isLiveAttempt({ status: "CREATED", paymentUrl: null, createdAt: new Date(now - 10_000) }, now), true);
      assert.equal(isLiveAttempt({ status: "CREATED", paymentUrl: null, createdAt: new Date(now - PAYMENT_IN_FLIGHT_LIVE_MS - 1000) }, now), false);
      assert.equal(isLiveAttempt(attempt("FAILED", 1000), now), false);
      assert.equal(isLiveAttempt(attempt("SUCCEEDED", 1000), now), false);
    },

    "stored consent: valid only when time and version are recorded and the version is still the current one"() {
      const now = new Date();
      const version = "terms:default-v1|refunds:default-v1";
      assert.deepEqual(termsConsentStatus({ termsAcceptedAt: now, termsVersion: version }, version), { ok: true });
      assert.deepEqual(termsConsentStatus({ termsAcceptedAt: now, termsVersion: version }, "terms:2026-11-09T00:00:00.000Z|refunds:default-v1"), { ok: false, termsChanged: true });
      assert.deepEqual(termsConsentStatus({ termsAcceptedAt: null, termsVersion: version }, version), { ok: false, termsChanged: false });
      assert.deepEqual(termsConsentStatus({ termsAcceptedAt: now, termsVersion: null }, version), { ok: false, termsChanged: false });
      assert.deepEqual(termsConsentStatus({ termsAcceptedAt: null, termsVersion: null }, version), { ok: false, termsChanged: false });
    },

    "competing-payment message: says another payment is in progress for the same design, what to do, and when the link ends"() {
      const now = Date.UTC(2026, 10, 9, 10, 0, 0);
      const info = competingPaymentMessage({ status: "PENDING", startedAt: new Date(now - 10 * 60_000), orderNumber: "TGFM-5001" }, now);
      assert.match(info.message, /Another payment for this design is already in progress on order TGFM-5001/);
      assert.match(info.message, /continue that order's payment, or wait until its payment link expires/);
      assert.match(info.message, /about 51 more minutes/);
      assert.equal(info.minutesLeft, 51);
      assert.equal(info.linkExpiresAt, new Date(now - 10 * 60_000 + PAYMENT_LINK_LIVE_MS).toISOString());
      const almost = competingPaymentMessage({ status: "PENDING", startedAt: new Date(now - 61 * 60_000 + 20_000), orderNumber: "N" }, now);
      assert.match(almost.message, /about 1 more minute\b/);
    },

    "competing-payment message: a payment being created right now, and no sensitive details in either text"() {
      const now = Date.now();
      const creating = competingPaymentMessage({ status: "CREATED", startedAt: new Date(now - 5000), orderNumber: "TGFM-5021" }, now);
      assert.match(creating.message, /being started right now on order TGFM-5021/);
      assert.equal(creating.linkExpiresAt, null);
      for (const text of [creating.message, competingPaymentMessage({ status: "PENDING", startedAt: new Date(now), orderNumber: "N" }, now).message]) {
        assert.doesNotMatch(text, /https?:|@|EGP|\d{6,}/, "no links, e-mail addresses, amounts or long numbers");
      }
    },
  });
}
