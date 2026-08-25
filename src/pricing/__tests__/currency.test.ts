// file: src/pricing/__tests__/currency.test.ts
import assert from "node:assert/strict";
import {
  convertUsdCentsToPaymentCents,
  InvalidExchangeRateInputError,
  isValidExchangeRate,
  parseExchangeRateInput,
} from "../currency";
import { runSuite } from "../../testing/test-harness";

export async function runAll() {
  return runSuite("pricing/currency", {
    "isValidExchangeRate accepts a normal positive rate"() {
      assert.equal(isValidExchangeRate(49.5), true);
      assert.equal(isValidExchangeRate(1), true);
    },

    "isValidExchangeRate rejects null (not configured)"() {
      assert.equal(isValidExchangeRate(null), false);
    },

    "isValidExchangeRate rejects undefined (not configured)"() {
      assert.equal(isValidExchangeRate(undefined), false);
    },

    "isValidExchangeRate rejects zero"() {
      assert.equal(isValidExchangeRate(0), false);
    },

    "isValidExchangeRate rejects a negative rate"() {
      assert.equal(isValidExchangeRate(-49.5), false);
    },

    "isValidExchangeRate rejects NaN"() {
      assert.equal(isValidExchangeRate(NaN), false);
    },

    "isValidExchangeRate rejects Infinity and -Infinity"() {
      assert.equal(isValidExchangeRate(Infinity), false);
      assert.equal(isValidExchangeRate(-Infinity), false);
    },

    "isValidExchangeRate rejects non-number types"() {
      assert.equal(isValidExchangeRate("49.5"), false);
      assert.equal(isValidExchangeRate({}), false);
      assert.equal(isValidExchangeRate([49.5]), false);
      assert.equal(isValidExchangeRate(true), false);
    },

    "convertUsdCentsToPaymentCents matches the worked example from the audit ($10.00 @ 49.50 -> 495.00 EGP)"() {
      assert.equal(convertUsdCentsToPaymentCents(1000, 49.5), 49500);
    },

    "convertUsdCentsToPaymentCents matches the approved sanity-check example ($8.02 @ 50 -> 401.00 EGP)"() {
      assert.equal(convertUsdCentsToPaymentCents(802, 50), 40100);
    },

    "convertUsdCentsToPaymentCents rounds to the nearest whole minor unit"() {
      // 333 * 1.005 = 334.665 -> rounds to 335
      assert.equal(convertUsdCentsToPaymentCents(333, 1.005), 335);
      // 100 * 1.004 = 100.4 -> rounds to 100
      assert.equal(convertUsdCentsToPaymentCents(100, 1.004), 100);
    },

    "parseExchangeRateInput returns null for a blank field (unconfigured, not an error)"() {
      assert.equal(parseExchangeRateInput(""), null);
      assert.equal(parseExchangeRateInput("   "), null);
    },

    "parseExchangeRateInput accepts a decimal rate like the settings form example"() {
      assert.equal(parseExchangeRateInput("49.75"), 49.75);
      assert.equal(parseExchangeRateInput(" 50.00 "), 50);
    },

    "parseExchangeRateInput rejects zero, negative, and non-numeric text instead of silently clearing"() {
      assert.throws(() => parseExchangeRateInput("0"), InvalidExchangeRateInputError);
      assert.throws(() => parseExchangeRateInput("-50"), InvalidExchangeRateInputError);
      assert.throws(() => parseExchangeRateInput("not-a-number"), InvalidExchangeRateInputError);
      assert.throws(() => parseExchangeRateInput("Infinity"), InvalidExchangeRateInputError);
    },

    "convertUsdCentsToPaymentCents is a single multiplication, not per-component conversion"() {
      // Converting a sum once must equal converting the same sum computed
      // any other way, as long as it's still one multiplication -- this is
      // what guarantees subtotal + tax + shipping (all USD, summed first)
      // converts to the same total as the order's own single conversion.
      const subtotalUsd = 802;
      const taxUsd = 40;
      const shippingUsd = 0;
      const canonicalTotalUsd = subtotalUsd + taxUsd + shippingUsd;
      const rate = 50;
      assert.equal(
        convertUsdCentsToPaymentCents(canonicalTotalUsd, rate),
        Math.round(canonicalTotalUsd * rate),
      );
    },
  });
}
