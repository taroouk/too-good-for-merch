// file: src/lib/orders/__tests__/totals.test.ts
import assert from "node:assert/strict";
import { computeOrderTotals, PAYMENT_CURRENCY } from "../totals";
import { runSuite } from "../../../testing/test-harness";

// 14% VAT and $5.00 shipping on the pricing sheet's cheapest Essentials
// Fitted unit ($8.02), converted at the rate the sheet itself was authored
// against (52.3893 EGP/USD). Deliberately fractional: an integral rate
// hides the single-vs-per-component rounding difference asserted below.
const SUBTOTAL_USD_CENTS = 802;
const TAX_RATE_BPS = 1400;
const SHIPPING_CENTS = 500;
const RATE = 52.3893;

function totals() {
  return computeOrderTotals({
    subtotalUsdCents: SUBTOTAL_USD_CENTS,
    taxRateBps: TAX_RATE_BPS,
    shippingCents: SHIPPING_CENTS,
    usdToEgpRate: RATE,
  });
}

export async function runAll() {
  return runSuite("lib/orders/totals", {
    "totalUsdCents includes tax and shipping, not just the subtotal"() {
      const result = totals();
      assert.equal(result.taxUsdCents, 112);
      assert.equal(result.shippingUsdCents, 500);
      assert.equal(result.totalUsdCents, 1414);
      // The checkout page used to display the subtotal alone as "Total".
      assert.notEqual(result.totalUsdCents, result.subtotalUsdCents);
    },

    "the payable total is the payment currency, not USD"() {
      const result = totals();
      assert.equal(result.paymentCurrency, PAYMENT_CURRENCY);
      assert.equal(result.paymentCurrency, "EGP");
      assert.notEqual(result.totalPaymentCents, result.totalUsdCents);
    },

    "converts the total exactly once instead of summing converted components"() {
      const result = totals();
      assert.equal(result.totalPaymentCents, Math.round(1414 * RATE));
      assert.equal(result.totalPaymentCents, 74078);

      // Converting each component independently and adding the roundings
      // drifts by a minor unit -- the thing the single-conversion rule
      // exists to prevent.
      const perComponent =
        Math.round(802 * RATE) + Math.round(112 * RATE) + Math.round(500 * RATE);
      assert.equal(perComponent, 74079);
      assert.notEqual(result.totalPaymentCents, perComponent);
    },

    "subtotal is converted from its own canonical USD figure"() {
      assert.equal(totals().subtotalPaymentCents, Math.round(802 * RATE));
    },

    "an unset tax rate and shipping are treated as zero, not skipped"() {
      const result = computeOrderTotals({
        subtotalUsdCents: 802,
        taxRateBps: null,
        shippingCents: undefined,
        usdToEgpRate: 50,
      });
      assert.equal(result.taxUsdCents, 0);
      assert.equal(result.shippingUsdCents, 0);
      assert.equal(result.totalUsdCents, 802);
      // Matches the approved worked example: $8.02 @ 50 -> EGP 401.00.
      assert.equal(result.totalPaymentCents, 40100);
    },

    "a negative configured shipping value is clamped rather than discounting the order"() {
      const result = computeOrderTotals({
        subtotalUsdCents: 1000,
        taxRateBps: 0,
        shippingCents: -2500,
        usdToEgpRate: 50,
      });
      assert.equal(result.shippingUsdCents, 0);
      assert.equal(result.totalUsdCents, 1000);
    },

    "the frozen exchange rate is carried through for display and audit"() {
      assert.equal(totals().exchangeRate, RATE);
    },
  });
}
