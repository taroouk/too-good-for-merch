// file: src/lib/admin/__tests__/currency-aggregates.test.ts
import assert from "node:assert/strict";
import { sumCanonicalUsd, sumByCurrency, sumInCurrency } from "../currency-aggregates";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/admin/currency-aggregates", {
    "sumCanonicalUsd sums only orders with a recorded canonical USD total"() {
      const result = sumCanonicalUsd([
        { canonicalTotalUsdCents: 1000 },
        { canonicalTotalUsdCents: 2500 },
        { canonicalTotalUsdCents: null },
      ]);
      assert.equal(result.revenueUsdCents, 3500);
      assert.equal(result.excludedLegacyCount, 1);
    },

    "sumCanonicalUsd never guesses a value for a legacy (null) order"() {
      const result = sumCanonicalUsd([{ canonicalTotalUsdCents: null }, { canonicalTotalUsdCents: null }]);
      assert.equal(result.revenueUsdCents, 0);
      assert.equal(result.excludedLegacyCount, 2);
    },

    "sumByCurrency never sums across different currencies"() {
      const totals = sumByCurrency([
        { totalCents: 1000, currency: "EGP" },
        { totalCents: 2000, currency: "EGP" },
        { totalCents: 500, currency: "USD" },
      ]);
      const egp = totals.find((t) => t.currency === "EGP");
      const usd = totals.find((t) => t.currency === "USD");
      assert.equal(egp?.totalCents, 3000);
      assert.equal(egp?.count, 2);
      assert.equal(usd?.totalCents, 500);
      assert.equal(usd?.count, 1);
    },

    "sumInCurrency reports the matching-currency total plus a count of everything excluded"() {
      const result = sumInCurrency(
        [
          { totalCents: 1000, currency: "EGP" },
          { totalCents: 2000, currency: "EGP" },
          { totalCents: 500, currency: "USD" },
        ],
        "EGP",
      );
      assert.equal(result.totalCents, 3000);
      assert.equal(result.otherCurrencyCount, 1);
    },

    "sumInCurrency returns zero (not a crash/NaN) when nothing matches the target currency"() {
      const result = sumInCurrency([{ totalCents: 500, currency: "USD" }], "EGP");
      assert.equal(result.totalCents, 0);
      assert.equal(result.otherCurrencyCount, 1);
    },

    "an all-mixed-currency dataset never gets silently collapsed into one figure"() {
      const orders = [
        { totalCents: 100, currency: "EGP" },
        { totalCents: 200, currency: "USD" },
        { totalCents: 300, currency: "SAR" },
      ];
      const totals = sumByCurrency(orders);
      assert.equal(totals.length, 3);
      // Sum of all totalCents (600) must never appear as a single bucket.
      assert.equal(totals.some((t) => t.totalCents === 600), false);
    },
  });
}
