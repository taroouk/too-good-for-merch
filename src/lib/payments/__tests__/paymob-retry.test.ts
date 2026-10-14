// file: src/lib/payments/__tests__/paymob-retry.test.ts
import assert from "node:assert/strict";
import {
  baseOrderNumber,
  isDuplicateMerchantOrderError,
  PaymobError,
  retryMerchantOrderId,
} from "../paymob";
import { runSuite } from "../../../testing/test-harness";

const ORDER_NUMBER = "TGFM-MV3LZAEA-0BB9B8";

function duplicateError() {
  return new PaymobError("Paymob request failed (422).", {
    stage: "create_order",
    status: 422,
    response: { message: "duplicate" },
  });
}

export async function runAll() {
  return runSuite("lib/payments/paymob-retry", {
    "a 422 duplicate from create_order is recognised"() {
      assert.equal(isDuplicateMerchantOrderError(duplicateError()), true);
    },
    "a 422 from another stage is not treated as a duplicate"() {
      const error = new PaymobError("x", { stage: "payment_key", status: 422, response: { message: "duplicate" } });
      assert.equal(isDuplicateMerchantOrderError(error), false);
    },
    "other create_order failures are not treated as a duplicate"() {
      const invalidCurrency = new PaymobError("x", {
        stage: "create_order",
        status: 422,
        response: { message: "Invalid currency sent" },
      });
      const serverError = new PaymobError("x", { stage: "create_order", status: 500, response: null });
      assert.equal(isDuplicateMerchantOrderError(invalidCurrency), false);
      assert.equal(isDuplicateMerchantOrderError(serverError), false);
    },
    "non-Paymob errors are never a duplicate"() {
      assert.equal(isDuplicateMerchantOrderError(new Error("duplicate")), false);
      assert.equal(isDuplicateMerchantOrderError(null), false);
    },
    "a retry merchant id differs from the order number and maps back to it"() {
      const retryId = retryMerchantOrderId(ORDER_NUMBER, "lq2x9k1a");
      assert.notEqual(retryId, ORDER_NUMBER);
      assert.equal(baseOrderNumber(retryId), ORDER_NUMBER);
    },
    "a plain order number is left untouched by baseOrderNumber"() {
      assert.equal(baseOrderNumber(ORDER_NUMBER), ORDER_NUMBER);
      assert.equal(baseOrderNumber("TGFM-BSPK-MV3FEUQ6-2E0BB7"), "TGFM-BSPK-MV3FEUQ6-2E0BB7");
    },
  });
}
