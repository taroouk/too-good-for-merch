// file: src/lib/orders/__tests__/totals.test.ts
import assert from "node:assert/strict";
import { computeCartTotals, computeOrderTotals, PAYMENT_CURRENCY } from "../totals";
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

    "the total is the whole-pound subtotal plus the whole-pound tax and shipping (one rounding model for every checkout)"() {
      const result = totals();
      assert.equal(result.totalPaymentCents, Math.round((1414 * RATE) / 100) * 100);
      assert.equal(result.totalPaymentCents, 74100);

      // Converting every component to minor units and adding the roundings
      // would drift by a minor unit; tax and shipping are converted together.
      const perComponent =
        Math.round(802 * RATE) + Math.round(112 * RATE) + Math.round(500 * RATE);
      assert.equal(perComponent, 74079);
      // The payment total is a whole number of pounds, converted once.
      assert.equal(result.totalPaymentCents % 100, 0);
    },

    "subtotal is converted from its own canonical USD figure"() {
      assert.equal(totals().subtotalPaymentCents, Math.round((802 * RATE) / 100) * 100);
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

    "cart: displayed lines add up exactly to the subtotal, and subtotal + fees to the total"() {
      // Rate and prices chosen so that converting the SUM could round differently from the sum of converted lines.
      const cart = computeCartTotals({ lineUsdCents: [802, 1111, 999], taxRateBps: 1400, shippingCents: 500, usdToEgpRate: RATE });
      assert.equal(cart.linePaymentCents.reduce((a, b) => a + b, 0), cart.subtotalPaymentCents);
      assert.ok(cart.linePaymentCents.every((cents) => cents % 100 === 0), "every line is whole pounds");
      assert.equal(cart.subtotalUsdCents, 802 + 1111 + 999);
      assert.equal(cart.taxUsdCents, Math.round(2912 * 0.14));
      assert.equal(cart.shippingUsdCents, 500, "shipping is charged once per order, not per item");
      assert.equal(cart.totalUsdCents, 2912 + cart.taxUsdCents + 500);
      assert.equal(cart.totalPaymentCents % 100, 0);
      assert.equal(cart.paymentCurrency, "EGP");
      assert.ok(cart.totalPaymentCents > cart.subtotalPaymentCents);
    },

    "cart: one item with no tax or shipping equals the single-build checkout total"() {
      for (const usd of [802, 1111, 2480, 99]) {
        const cart = computeCartTotals({ lineUsdCents: [usd], taxRateBps: 0, shippingCents: 0, usdToEgpRate: RATE });
        const single = computeOrderTotals({ subtotalUsdCents: usd, taxRateBps: 0, shippingCents: 0, usdToEgpRate: RATE });
        assert.equal(cart.totalPaymentCents, single.totalPaymentCents);
        assert.equal(cart.subtotalPaymentCents, single.subtotalPaymentCents);
      }
    },

    "cart: free shipping and zero tax make the total the sum of the lines"() {
      const cart = computeCartTotals({ lineUsdCents: [990, 990, 1980], taxRateBps: null, shippingCents: undefined, usdToEgpRate: 50 });
      assert.deepEqual(cart.linePaymentCents, [49500, 49500, 99000]);
      assert.equal(cart.totalPaymentCents, 198000);
      assert.equal(cart.totalUsdCents, 3960);
    },

    "Buy Now and the bag give the same amount for the same item, with tax and shipping at zero AND non-zero"() {
      // The audit example (rate 47.3, $8.02, 14% tax, $5.00 shipping) used to be 66,900 (Buy Now) vs 66,800 (bag).
      const audit = { rate: 47.3, usd: 802, tax: 1400, ship: 500 };
      const single = computeOrderTotals({ subtotalUsdCents: audit.usd, taxRateBps: audit.tax, shippingCents: audit.ship, usdToEgpRate: audit.rate });
      const cart = computeCartTotals({ lineUsdCents: [audit.usd], taxRateBps: audit.tax, shippingCents: audit.ship, usdToEgpRate: audit.rate });
      assert.equal(single.totalPaymentCents, cart.totalPaymentCents);
      assert.equal(single.totalPaymentCents, 66800);
      // And exhaustively over a grid of rates, prices, tax and shipping (including zero).
      for (const rate of [47.3, 49.99, 50, 51.07, 52.3893]) {
        for (const usd of [99, 802, 990, 1111, 2480]) {
          for (const tax of [0, 500, 1400]) {
            for (const ship of [0, 300, 500, 750]) {
              const a = computeOrderTotals({ subtotalUsdCents: usd, taxRateBps: tax, shippingCents: ship, usdToEgpRate: rate });
              const b = computeCartTotals({ lineUsdCents: [usd], taxRateBps: tax, shippingCents: ship, usdToEgpRate: rate });
              assert.equal(a.totalPaymentCents, b.totalPaymentCents, `total ${rate}/${usd}/${tax}/${ship}`);
              assert.equal(a.subtotalPaymentCents, b.subtotalPaymentCents, `subtotal ${rate}/${usd}/${tax}/${ship}`);
              assert.equal(a.totalUsdCents, b.totalUsdCents);
              assert.equal(a.totalPaymentCents % 100, 0);
              // the subtotal is the Studio's displayed price for the item (whole pounds, converted from its own USD figure)
              assert.equal(a.subtotalPaymentCents, Math.round((usd * rate) / 100) * 100);
            }
          }
        }
      }
    },

    "tax and shipping non-zero: shipping once per order, tax on the summed subtotal, total = subtotal + fees"() {
      const cart = computeCartTotals({ lineUsdCents: [802, 990], taxRateBps: 1400, shippingCents: 500, usdToEgpRate: 50 });
      assert.equal(cart.taxUsdCents, Math.round(1792 * 0.14));
      assert.equal(cart.totalPaymentCents, cart.subtotalPaymentCents + Math.round(((cart.taxUsdCents + 500) * 50) / 100) * 100);
    },

    "cart: an empty bag has a zero total (the server refuses it before this is used)"() {
      const cart = computeCartTotals({ lineUsdCents: [], taxRateBps: 0, shippingCents: 0, usdToEgpRate: 50 });
      assert.equal(cart.totalPaymentCents, 0);
    },
  });
}
