// file: src/studio/render/__tests__/rotation-preservation.test.ts
import assert from "node:assert/strict";
import { clampArtworkRotation, TRANSFORM_BOUNDS } from "../transform";
import { runSuite } from "./test-harness";

export async function runAll() {
  return runSuite("render/rotation-preservation", {
    "a normal rotation is preserved verbatim"() {
      assert.equal(clampArtworkRotation(45), 45);
      assert.equal(clampArtworkRotation(-90), -90);
      assert.equal(clampArtworkRotation(0), 0);
    },

    "rotation is clamped to the shared TRANSFORM_BOUNDS"() {
      assert.equal(clampArtworkRotation(999), TRANSFORM_BOUNDS.rotation.max);
      assert.equal(clampArtworkRotation(-999), TRANSFORM_BOUNDS.rotation.min);
      assert.equal(clampArtworkRotation(TRANSFORM_BOUNDS.rotation.max), 180);
      assert.equal(clampArtworkRotation(TRANSFORM_BOUNDS.rotation.min), -180);
    },

    "missing or non-numeric rotation degrades to the identity rotation"() {
      assert.equal(clampArtworkRotation(undefined), 0);
      assert.equal(clampArtworkRotation(null), 0);
      assert.equal(clampArtworkRotation("45"), 0);
      assert.equal(clampArtworkRotation({}), 0);
    },

    "NaN and Infinity never propagate into a render request"() {
      assert.equal(clampArtworkRotation(Number.NaN), 0);
      assert.equal(clampArtworkRotation(Number.POSITIVE_INFINITY), 0);
      assert.equal(clampArtworkRotation(Number.NEGATIVE_INFINITY), 0);
    },

    // P3-21c regression: the builder used to write `rotation: 0` into the
    // saved placement and into the mockup fingerprint regardless of the
    // persisted value, so re-saving destroyed a non-zero rotation. The client
    // now routes rotation through this helper, which must be a no-op for any
    // in-range value -- a round-trip through it has to be lossless.
    "a persisted in-range rotation survives a client round-trip unchanged"() {
      for (const rotation of [-180, -137.5, -1, 0, 1, 22.5, 137.5, 180]) {
        assert.equal(
          clampArtworkRotation(clampArtworkRotation(rotation)),
          rotation,
          `rotation ${rotation} was not preserved`,
        );
      }
    },
  });
}
