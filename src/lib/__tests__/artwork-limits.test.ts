// file: src/lib/__tests__/artwork-limits.test.ts
import assert from "node:assert/strict";
import { artworkExceedsDimensionLimits } from "../artwork-limits";
import { runSuite } from "../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/artwork-limits", {
    "a typical print-sized artwork is accepted"() {
      assert.equal(artworkExceedsDimensionLimits(3508, 4961), false);
      assert.equal(artworkExceedsDimensionLimits(4000, 4000), false);
    },
    "the 10000x10000 memory-hog is rejected"() {
      assert.equal(artworkExceedsDimensionLimits(10000, 10000), true);
    },
    "a very long thin image is rejected by the per-side limit"() {
      assert.equal(artworkExceedsDimensionLimits(20000, 100), true);
    },
    "an image under the side limit but over the pixel budget is rejected"() {
      assert.equal(artworkExceedsDimensionLimits(7000, 7000), true);
    },
    "non-finite dimensions are rejected"() {
      assert.equal(artworkExceedsDimensionLimits(Number.NaN, 100), true);
    },
  });
}
