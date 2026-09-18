// file: src/studio/render/__tests__/transform.test.ts
import assert from "node:assert/strict";
import { resolvePlacement, TRANSFORM_BOUNDS, validateTransform } from "../transform";
import { RendererError } from "../errors";
import { runSuite } from "./test-harness";

function expectThrows(fn: () => void, message: string) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    assert.ok(err instanceof RendererError, `expected a RendererError, got ${err}`);
  }
  assert.ok(threw, message);
}

export async function runAll() {
  return runSuite("transform", {
    "validateTransform rejects NaN"() {
      expectThrows(
        () => validateTransform({ x: Number.NaN, y: 0, scale: 1 }),
        "expected NaN x to throw",
      );
    },

    "validateTransform rejects Infinity"() {
      expectThrows(
        () => validateTransform({ x: 0, y: Number.POSITIVE_INFINITY, scale: 1 }),
        "expected Infinity y to throw",
      );
    },

    "validateTransform rejects out-of-bounds scale"() {
      expectThrows(
        () => validateTransform({ x: 0, y: 0, scale: TRANSFORM_BOUNDS.scale.max + 1 }),
        "expected out-of-bounds scale to throw",
      );
    },

    "validateTransform accepts a normal transform"() {
      validateTransform({ x: 0.1, y: -0.05, scale: 1.2, rotation: 15 });
    },

    "resolvePlacement matches hand-computed pixel output at scale 1"() {
      const resolved = resolvePlacement({
        product: "FITTED",
        color: "WHITE",
        placement: "CENTER_FRONT",
        transform: { x: 0, y: 0, scale: 1 },
        templateWidth: 1000,
        templateHeight: 1000,
        artworkWidth: 200,
        artworkHeight: 100,
      });
      assert.equal(resolved.left, 340);
      assert.equal(resolved.top, 400);
      assert.equal(resolved.width, 320);
      assert.equal(resolved.height, 160);
      assert.equal(resolved.rotation, 0);
    },

    "resolvePlacement scales width/height proportionally with transform.scale"() {
      const resolved = resolvePlacement({
        product: "FITTED",
        color: "WHITE",
        placement: "CENTER_FRONT",
        // CENTER_FRONT's own effective scale ceiling (MAX_PLACEMENT_WIDTH_FRACTION
        // / widthPct = 0.45 / 0.24 = 1.875) is below the requested 2, so the
        // resolved size reflects the clamped 1.875, not the raw request --
        // exactly what getEffectiveScaleBounds exists to guarantee.
        transform: { x: 0, y: 0, scale: 2 },
        templateWidth: 1000,
        templateHeight: 1000,
        artworkWidth: 200,
        artworkHeight: 100,
      });
      assert.equal(resolved.width, 450);
      assert.equal(resolved.height, 225);
    },

    "resolvePlacement moves the anchor with x/y offsets"() {
      // x/y are fractions of templateWidth/templateHeight (resolution-
      // independent -- see the ASSUMED_PREVIEW_CONTAINER_PX removal),
      // not raw px: x=0.5 on a 1000px-wide template moves the anchor by
      // 500px, same magnitude the old px-based x=320-against-a-640-assumed
      // -container test asserted, now expressed as a fraction.
      const resolved = resolvePlacement({
        product: "FITTED",
        color: "WHITE",
        placement: "CENTER_FRONT",
        transform: { x: 0.5, y: 0, scale: 1 },
        templateWidth: 1000,
        templateHeight: 1000,
        artworkWidth: 200,
        artworkHeight: 100,
      });
      assert.equal(resolved.left, 840);
    },

    "resolvePlacement rejects x/y beyond TRANSFORM_BOUNDS"() {
      expectThrows(
        () =>
          resolvePlacement({
            product: "FITTED",
            color: "WHITE",
            placement: "CENTER_FRONT",
            transform: { x: TRANSFORM_BOUNDS.x.max + 1, y: 0, scale: 1 },
            templateWidth: 1000,
            templateHeight: 1000,
            artworkWidth: 200,
            artworkHeight: 100,
          }),
        "expected out-of-bounds x fraction to throw",
      );
    },

    "resolvePlacement is deterministic for identical input"() {
      const input: Parameters<typeof resolvePlacement>[0] = {
        product: "OVERSIZED",
        color: "BLACK",
        placement: "LEFT_CHEST",
        transform: { x: 0.12, y: -0.07, scale: 1.1, rotation: 5 },
        templateWidth: 2480,
        templateHeight: 2480,
        artworkWidth: 512,
        artworkHeight: 512,
      };
      const first = resolvePlacement(input);
      const second = resolvePlacement(input);
      assert.deepEqual(first, second);
    },
  });
}
