// file: src/pricing/__tests__/display.test.ts
import assert from "node:assert/strict";
import { convertForDisplay, effectiveDisplay, formatDisplayPrice, parseDisplayCurrency, USD_DISPLAY } from "../display";
import { adjustPrice, validateBulkAdjustment } from "../../lib/admin/bulk-pricing";
import { runSuite } from "../../testing/test-harness";

export async function runAll() {
  return runSuite("pricing/display", {
    "parseDisplayCurrency defaults to USD for junk"() {
      assert.equal(parseDisplayCurrency("eur"), "USD");
      assert.equal(parseDisplayCurrency(null), "USD");
      assert.equal(parseDisplayCurrency(" egp "), "EGP");
    },
    "EGP display needs a valid rate, else falls back to USD"() {
      assert.deepEqual(effectiveDisplay("EGP", 50), { currency: "EGP", rate: 50 });
      assert.deepEqual(effectiveDisplay("EGP", null), USD_DISPLAY);
      assert.deepEqual(effectiveDisplay("EGP", 0), USD_DISPLAY);
      assert.deepEqual(effectiveDisplay("USD", 50), USD_DISPLAY);
    },
    "EGP conversion matches checkout (cents rounded once)"() {
      assert.equal(convertForDisplay(9.54, { currency: "EGP", rate: 49.5 }), 472.23);
      assert.equal(formatDisplayPrice(9.54, { currency: "EGP", rate: 49.5 }), "EGP 472.23");
      assert.equal(formatDisplayPrice(9.54, USD_DISPLAY), "USD 9.54");
    },
    "adjustPrice percent and fixed, floored at 0.01"() {
      assert.equal(adjustPrice(10, "percent", 10), 11);
      assert.equal(adjustPrice(9.54, "percent", -5), 9.06);
      assert.equal(adjustPrice(10, "fixed", -2.5), 7.5);
      assert.equal(adjustPrice(1, "fixed", -5), 0.01);
    },
    "validateBulkAdjustment bounds"() {
      assert.equal(validateBulkAdjustment("percent", 0) !== null, true);
      assert.equal(validateBulkAdjustment("percent", -95) !== null, true);
      assert.equal(validateBulkAdjustment("percent", 600) !== null, true);
      assert.equal(validateBulkAdjustment("percent", 10), null);
      assert.equal(validateBulkAdjustment("fixed", 2000) !== null, true);
      assert.equal(validateBulkAdjustment("fixed", -1), null);
    },
  });
}
