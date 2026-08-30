// file: src/lib/bespoke/__tests__/eligibility.test.ts
import assert from "node:assert/strict";
import {
  assertBespokeOnly,
  isBespokeProduct,
  isPaymobEligible,
  BespokeRoutingError,
} from "../eligibility";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/bespoke/eligibility", {
    "CUSTOM is bespoke and never Paymob-eligible"() {
      assert.equal(isBespokeProduct("CUSTOM"), true);
      assert.equal(isPaymobEligible("CUSTOM"), false);
    },

    "FITTED and OVERSIZED are Paymob-eligible and not bespoke"() {
      for (const p of ["FITTED", "OVERSIZED"]) {
        assert.equal(isPaymobEligible(p), true);
        assert.equal(isBespokeProduct(p), false);
      }
    },

    "null / unknown products are neither"() {
      assert.equal(isPaymobEligible(null), false);
      assert.equal(isPaymobEligible("WHATEVER"), false);
      assert.equal(isBespokeProduct(null), false);
    },

    "assertBespokeOnly passes for CUSTOM"() {
      assert.doesNotThrow(() => assertBespokeOnly("CUSTOM"));
    },

    "assertBespokeOnly throws (400) for a standard product"() {
      assert.throws(() => assertBespokeOnly("FITTED"), (e: unknown) => {
        return e instanceof BespokeRoutingError && (e as BespokeRoutingError).status === 400;
      });
    },
  });
}
