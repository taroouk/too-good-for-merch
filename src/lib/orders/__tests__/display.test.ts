// file: src/lib/orders/__tests__/display.test.ts
import assert from "node:assert/strict";
import { formatExchangeRate, formatMoney, isNewPricingModel, itemDisplayCurrency } from "../display";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/orders/display", {
    "isNewPricingModel is true when canonicalTotalUsdCents is populated (new order)"() {
      assert.equal(isNewPricingModel({ canonicalTotalUsdCents: 2000 }), true);
    },

    "isNewPricingModel is false when canonicalTotalUsdCents is null (historical order)"() {
      assert.equal(isNewPricingModel({ canonicalTotalUsdCents: null }), false);
    },

    "itemDisplayCurrency is USD for a new-model order regardless of order.currency"() {
      assert.equal(itemDisplayCurrency({ canonicalTotalUsdCents: 2000, currency: "EGP" }), "USD");
    },

    "itemDisplayCurrency falls back to order.currency for a historical order"() {
      assert.equal(itemDisplayCurrency({ canonicalTotalUsdCents: null, currency: "EGP" }), "EGP");
      assert.equal(itemDisplayCurrency({ canonicalTotalUsdCents: null, currency: "USD" }), "USD");
    },

    "formatExchangeRate matches the approved worked example (49.50)"() {
      assert.equal(formatExchangeRate(49.5), 49.5);
    },

    "formatExchangeRate drops trailing-zero noise instead of padding to 4 decimals"() {
      assert.equal(formatExchangeRate(50), 50);
    },

    "formatExchangeRate rounds to 4 decimal places"() {
      assert.equal(formatExchangeRate(49.123456), 49.1235);
    },

    "formatMoney renders USD cents as a dollar amount"() {
      assert.equal(formatMoney(802, "USD"), "$8.02");
    },

    "formatMoney renders EGP cents with the EGP currency code, not USD"() {
      const formatted = formatMoney(40100, "EGP");
      assert.match(formatted, /EGP/);
      assert.doesNotMatch(formatted, /\$/);
    },
  });
}
