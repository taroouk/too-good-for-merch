// file: src/lib/orders/__tests__/currency.test.ts
import assert from "node:assert/strict";
import { SUPPORTED_PAYMENT_CURRENCY, unsupportedCurrencyMessage, validatePaymentCurrencyInput } from "../currency";
import { PAYMENT_CURRENCY } from "../totals";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/orders/currency (EGP is the only payment currency)", {
    "the supported currency is the one orders are created in"() {
      assert.equal(SUPPORTED_PAYMENT_CURRENCY, PAYMENT_CURRENCY);
      assert.equal(SUPPORTED_PAYMENT_CURRENCY, "EGP");
    },

    "unset or EGP (any case, with spaces) is fine; anything else produces an explanation"() {
      for (const ok of [undefined, null, "", "  ", "EGP", "egp", " EGP "]) assert.equal(unsupportedCurrencyMessage("STORE_CURRENCY", ok), null);
      for (const bad of ["USD", "usd", "EUR", "SAR"]) {
        const message = unsupportedCurrencyMessage("The stored payment currency", bad);
        assert.ok(message && message.includes(bad.toUpperCase()) && /only EGP is supported/.test(message) && /no effect/.test(message));
      }
    },

    "the admin form accepts only EGP and says what to enter"() {
      assert.equal(validatePaymentCurrencyInput("EGP"), null);
      assert.equal(validatePaymentCurrencyInput("egp"), null);
      assert.match(validatePaymentCurrencyInput("USD") ?? "", /Only EGP is supported.*Enter EGP/);
      assert.match(validatePaymentCurrencyInput("EG") ?? "", /invalid/);
      assert.match(validatePaymentCurrencyInput("EURO") ?? "", /invalid/);
      assert.match(validatePaymentCurrencyInput("12$") ?? "", /invalid/);
    },
  });
}
