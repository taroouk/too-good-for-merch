// file: src/lib/orders/__tests__/display.test.ts
import assert from "node:assert/strict";
import {
  formatExchangeRate,
  formatMoney,
  isNewPricingModel,
  itemDisplayCurrency,
  ORDER_TOTAL_FILTER_HINT,
  orderTotalFilterLabel,
  orderPaymentBreakdown,
  orderUsdSurcharges,
  resolveOrderMockupIds,
} from "../display";
import { PAYMENT_CURRENCY } from "../totals";
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

    // P1-8 regression: a paid order must keep showing the mockups the
    // customer actually purchased, even if they keep editing the same
    // Build afterwards (BuildDraft.printMockupId/aiMockupId can be
    // reassigned to a newer Mockup row at any time).
    "resolveOrderMockupIds prefers the purchase-time snapshot over the live BuildDraft pointers"() {
      const preview = { printMockupId: "print-at-purchase", aiMockupId: "ai-at-purchase" };
      const liveDraft = { printMockupId: "print-after-edit", aiMockupId: "ai-after-edit" };
      assert.deepEqual(resolveOrderMockupIds(preview, liveDraft), {
        printMockupId: "print-at-purchase",
        aiMockupId: "ai-at-purchase",
      });
    },

    "resolveOrderMockupIds falls back to the live BuildDraft pointers for orders placed before the snapshot existed"() {
      const liveDraft = { printMockupId: "print-legacy", aiMockupId: "ai-legacy" };
      assert.deepEqual(resolveOrderMockupIds(null, liveDraft), {
        printMockupId: "print-legacy",
        aiMockupId: "ai-legacy",
      });
      assert.deepEqual(resolveOrderMockupIds({}, liveDraft), {
        printMockupId: "print-legacy",
        aiMockupId: "ai-legacy",
      });
    },

    "resolveOrderMockupIds returns nulls when neither a snapshot nor a live draft has a mockup"() {
      assert.deepEqual(resolveOrderMockupIds(null, null), { printMockupId: null, aiMockupId: null });
      assert.deepEqual(resolveOrderMockupIds({}, { printMockupId: null, aiMockupId: null }), {
        printMockupId: null,
        aiMockupId: null,
      });
    },

    "resolveOrderMockupIds ignores malformed preview data instead of throwing"() {
      assert.deepEqual(resolveOrderMockupIds("not-an-object", null), { printMockupId: null, aiMockupId: null });
      assert.deepEqual(resolveOrderMockupIds({ printMockupId: 123, aiMockupId: true }, null), {
        printMockupId: null,
        aiMockupId: null,
      });
    },

    // P3-21d regression: the admin card rendered "Subtotal" + "Shipping: TBC"
    // + "Total", which visibly failed to add up whenever tax or shipping was
    // non-zero. The breakdown must always reconcile.
    "orderPaymentBreakdown always reconciles: subtotal + surcharge === total"() {
      const cases = [
        { subtotalCents: 10_000, totalCents: 12_500 },
        { subtotalCents: 10_000, totalCents: 10_000 },
        { subtotalCents: 0, totalCents: 0 },
        { subtotalCents: 99_999, totalCents: 100_000 },
        // Defensive: a legacy row where total is below subtotal must still
        // reconcile (as a negative surcharge) rather than silently mislead.
        { subtotalCents: 12_000, totalCents: 10_000 },
      ];
      for (const order of cases) {
        const b = orderPaymentBreakdown(order);
        assert.equal(b.subtotalCents + b.surchargeCents, b.totalCents);
        assert.equal(b.subtotalCents, order.subtotalCents);
        assert.equal(b.totalCents, order.totalCents);
      }
    },

    "orderPaymentBreakdown reports a zero surcharge when total equals subtotal"() {
      assert.equal(orderPaymentBreakdown({ subtotalCents: 5_000, totalCents: 5_000 }).surchargeCents, 0);
    },

    "orderUsdSurcharges reads the canonical USD tax/shipping snapshot"() {
      assert.deepEqual(orderUsdSurcharges({ taxCents: 250, shippingCents: 1_000 }), {
        taxUsdCents: 250,
        shippingUsdCents: 1_000,
      });
    },

    "orderUsdSurcharges reports null (not zero) when the values were never recorded"() {
      assert.deepEqual(orderUsdSurcharges(null), { taxUsdCents: null, shippingUsdCents: null });
      assert.deepEqual(orderUsdSurcharges({}), { taxUsdCents: null, shippingUsdCents: null });
      assert.deepEqual(orderUsdSurcharges({ taxCents: 0 }), { taxUsdCents: 0, shippingUsdCents: null });
    },

    "orderUsdSurcharges ignores malformed preview data instead of throwing"() {
      assert.deepEqual(orderUsdSurcharges("nope"), { taxUsdCents: null, shippingUsdCents: null });
      assert.deepEqual(orderUsdSurcharges({ taxCents: "250", shippingCents: Number.NaN }), {
        taxUsdCents: null,
        shippingUsdCents: null,
      });
    },

    // P3-21e regression: the labels read bare "Min total"/"Max total" while
    // the query filtered Order.totalCents, which is the EGP payment amount.
    "orderTotalFilterLabel names the payment currency the filter actually uses"() {
      assert.equal(orderTotalFilterLabel("Min"), `Min total (${PAYMENT_CURRENCY})`);
      assert.equal(orderTotalFilterLabel("Max"), `Max total (${PAYMENT_CURRENCY})`);
    },

    "the amount-filter labels are never left unqualified"() {
      for (const bound of ["Min", "Max"] as const) {
        const label = orderTotalFilterLabel(bound);
        assert.ok(label.includes(PAYMENT_CURRENCY), `"${label}" is missing the currency unit`);
        assert.notEqual(label, `${bound} total`);
      }
    },

    "the amount-filter hint distinguishes the payment total from canonical USD"() {
      assert.ok(ORDER_TOTAL_FILTER_HINT.includes(PAYMENT_CURRENCY));
      assert.ok(ORDER_TOTAL_FILTER_HINT.includes("USD"));
    },
  });
}
