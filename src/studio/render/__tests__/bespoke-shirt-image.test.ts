// file: src/studio/render/__tests__/bespoke-shirt-image.test.ts
//
// Regression coverage for getBespokeShirtImage() -- extracted out of
// BuilderClient.tsx so the Bespoke canvas's garment-image selection is a
// pure, testable function rather than a private component-local one.
//
// This suite exists because of a user-reported regression: "the Bespoke
// preview appears stuck on ONE garment image" after getBespokeShirtImage's
// side detection was changed from a raw `.includes("BACK")` string check to
// the canonical getPlacementSide() lookup, plus a `product` prop was added
// to BespokeModal around the same time. Live-traced testing in the actual
// running app (checking the rendered <img src> through FRONT<->BACK,
// product, and color changes) did NOT reproduce a stuck image -- every
// transition updated correctly. This suite locks that proof in permanently:
// every (product, color, placement) combination below must resolve to a
// DIFFERENT, correct image, never the same static/fallback path.
import assert from "node:assert/strict";
import { getBespokeShirtImage } from "../bespoke-shirt-image";
import { runSuite } from "./test-harness";

export async function runAll() {
  return runSuite("bespoke-shirt-image", {
    "FRONT -> BACK actually changes the image source to the BACK asset"() {
      const front = getBespokeShirtImage("FITTED", "WHITE", "CENTER_FRONT");
      const back = getBespokeShirtImage("FITTED", "WHITE", "CENTER_BACK");
      assert.notEqual(front, back, "expected a different image for FRONT vs BACK, not the same static image");
      assert.equal(front, "/images/TGFM White.png");
      assert.equal(back, "/images/TGFM White Back.png");
    },

    "BACK -> FRONT changes it back to the FRONT asset (round trip, not stuck on BACK)"() {
      const back = getBespokeShirtImage("FITTED", "WHITE", "FULL_BACK");
      const front = getBespokeShirtImage("FITTED", "WHITE", "FULL_FRONT");
      assert.notEqual(back, front);
      assert.equal(back, "/images/TGFM White Back.png");
      assert.equal(front, "/images/TGFM White.png");
    },

    "every FRONT placement key resolves to the front image, every BACK placement key resolves to the back image"() {
      const frontPlacements = ["FULL_FRONT", "CENTER_FRONT", "LEFT_CHEST", "RIGHT_CHEST", "LEFT_SLEEVE", "RIGHT_SLEEVE"] as const;
      const backPlacements = ["FULL_BACK", "CENTER_BACK"] as const;

      for (const placement of frontPlacements) {
        assert.equal(
          getBespokeShirtImage("FITTED", "WHITE", placement),
          "/images/TGFM White.png",
          `expected the FRONT image for placement=${placement}`,
        );
      }
      for (const placement of backPlacements) {
        assert.equal(
          getBespokeShirtImage("FITTED", "WHITE", placement),
          "/images/TGFM White Back.png",
          `expected the BACK image for placement=${placement}`,
        );
      }
    },

    "product change (FITTED -> OVERSIZED) changes the image, for both FRONT and BACK"() {
      assert.notEqual(
        getBespokeShirtImage("FITTED", "BLACK", "CENTER_FRONT"),
        getBespokeShirtImage("OVERSIZED", "BLACK", "CENTER_FRONT"),
        "expected FITTED and OVERSIZED to resolve to different front images",
      );
      assert.notEqual(
        getBespokeShirtImage("FITTED", "BLACK", "CENTER_BACK"),
        getBespokeShirtImage("OVERSIZED", "BLACK", "CENTER_BACK"),
        "expected FITTED and OVERSIZED to resolve to different back images",
      );
      assert.equal(getBespokeShirtImage("OVERSIZED", "BLACK", "CENTER_FRONT"), "/images/Oversized Black.png");
      assert.equal(getBespokeShirtImage("OVERSIZED", "BLACK", "CENTER_BACK"), "/images/Oversized Black Back.png");
    },

    "color change (WHITE -> BLACK) changes the image, for both FRONT and BACK, both products"() {
      for (const product of ["FITTED", "OVERSIZED"] as const) {
        for (const placement of ["CENTER_FRONT", "CENTER_BACK"] as const) {
          const white = getBespokeShirtImage(product, "WHITE", placement);
          const black = getBespokeShirtImage(product, "BLACK", placement);
          assert.notEqual(
            white,
            black,
            `expected WHITE and BLACK to resolve to different images for ${product}/${placement}`,
          );
        }
      }
    },

    "every (product, color, side) combination resolves to a distinct image -- 8 combinations, 8 distinct paths"() {
      const seen = new Set<string>();
      for (const product of ["FITTED", "OVERSIZED"] as const) {
        for (const color of ["WHITE", "BLACK"] as const) {
          for (const placement of ["CENTER_FRONT", "CENTER_BACK"] as const) {
            seen.add(getBespokeShirtImage(product, color, placement));
          }
        }
      }
      assert.equal(seen.size, 8, `expected 8 distinct image paths across all (product, color, side) combinations, got ${seen.size}: ${[...seen].join(", ")}`);
    },

    "null product/color fall back to FITTED/WHITE (the same default BuilderClient's own state uses), not a broken path"() {
      assert.equal(getBespokeShirtImage(null, null, "CENTER_FRONT"), "/images/TGFM White.png");
      assert.equal(getBespokeShirtImage(null, null, "CENTER_BACK"), "/images/TGFM White Back.png");
    },

    "CUSTOM (Bespoke) product/color fall back the same way -- Bespoke has no template of its own yet"() {
      assert.equal(getBespokeShirtImage("CUSTOM", "CUSTOM", "CENTER_FRONT"), "/images/TGFM White.png");
      assert.equal(getBespokeShirtImage("CUSTOM", "CUSTOM", "CENTER_BACK"), "/images/TGFM White Back.png");
    },

    "is a pure function: identical input produces byte-identical output every call (no hidden state/caching bug)"() {
      const a = getBespokeShirtImage("OVERSIZED", "BLACK", "FULL_BACK");
      const b = getBespokeShirtImage("OVERSIZED", "BLACK", "FULL_BACK");
      assert.equal(a, b);
    },
  });
}
