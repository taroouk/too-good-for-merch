// file: src/lib/__tests__/design-title.test.ts
import assert from "node:assert/strict";
import { designTitle, labelize } from "../design-title";
import { runSuite } from "../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/design-title", {
    "labelize title-cases enum values"() {
      assert.equal(labelize("SIGNATURE_200"), "Signature 200");
      assert.equal(labelize(null), "—");
    },
    "default or missing names fall back to what the design is"() {
      assert.equal(designTitle({ name: "Untitled", product: "FITTED", color: "BLACK" }), "Fitted T-shirt · Black");
      assert.equal(designTitle({ name: null, product: "OVERSIZED", color: null }), "Oversized T-shirt");
      assert.equal(designTitle({ name: "  ", product: null, color: null }), "T-shirt");
    },
    "a real name is kept"() {
      assert.equal(designTitle({ name: "Summer drop", product: "FITTED", color: "WHITE" }), "Summer drop");
    },
  });
}
