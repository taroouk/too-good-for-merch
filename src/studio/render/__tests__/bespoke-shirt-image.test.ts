// file: src/studio/render/__tests__/bespoke-shirt-image.test.ts
//
// Regression coverage for getBespokeShirtImage() -- extracted out of
// BuilderClient.tsx so the Bespoke canvas's garment-image selection is a
// pure, testable function rather than a private component-local one.
//
// This suite exists because of a user-reported regression: "the Bespoke
// preview appears stuck on ONE garment image" after getBespokeShirtImage's
// side detection was changed from a raw `.includes("BACK")` string check to
// the canonical getPlacementSide() lookup. That is still the property being
// locked in below -- FRONT and BACK must always resolve to different,
// correct images, and the round trip must never stick.
//
// WHAT CHANGED: the popup now designs on the flat EDITOR tee
// (editor-surface.ts), not on one of the 8 photographed-model templates, so
// the image no longer varies by product or colour -- only by side. The
// product/colour-dependent part of the popup moved to the GEOMETRY
// (getEditorPlacementBox / toEditorOffset, covered in
// editor-surface.test.ts), which is what actually has to differ per
// garment. The old "8 distinct paths" assertion encoded the previous
// design and is replaced by its successor invariant below: exactly 2
// distinct paths, and product/colour provably cannot change them.
import assert from "node:assert/strict";
import { getBespokeShirtImage } from "../bespoke-shirt-image";
import { runSuite } from "./test-harness";

const FRONT_TEE = "/images/front -tshirt 1.png";
const BACK_TEE = "/images/t-shirt back 1.png";

export async function runAll() {
  return runSuite("bespoke-shirt-image", {
    "FRONT -> BACK actually changes the image source to the BACK asset"() {
      const front = getBespokeShirtImage("FITTED", "WHITE", "CENTER_FRONT");
      const back = getBespokeShirtImage("FITTED", "WHITE", "CENTER_BACK");
      assert.notEqual(front, back, "expected a different image for FRONT vs BACK, not the same static image");
      assert.equal(front, FRONT_TEE);
      assert.equal(back, BACK_TEE);
    },

    "BACK -> FRONT changes it back to the FRONT asset (round trip, not stuck on BACK)"() {
      const back = getBespokeShirtImage("FITTED", "WHITE", "FULL_BACK");
      const front = getBespokeShirtImage("FITTED", "WHITE", "FULL_FRONT");
      assert.notEqual(back, front);
      assert.equal(back, BACK_TEE);
      assert.equal(front, FRONT_TEE);
    },

    "every FRONT placement key resolves to the front tee, every BACK placement key resolves to the back tee"() {
      const frontPlacements = ["FULL_FRONT", "CENTER_FRONT", "LEFT_CHEST", "RIGHT_CHEST", "LEFT_SLEEVE", "RIGHT_SLEEVE"] as const;
      const backPlacements = ["FULL_BACK", "CENTER_BACK"] as const;

      for (const placement of frontPlacements) {
        assert.equal(
          getBespokeShirtImage("FITTED", "WHITE", placement),
          FRONT_TEE,
          `expected the FRONT tee for placement=${placement}`,
        );
      }
      for (const placement of backPlacements) {
        assert.equal(
          getBespokeShirtImage("FITTED", "WHITE", placement),
          BACK_TEE,
          `expected the BACK tee for placement=${placement}`,
        );
      }
    },

    "the editor surface is garment-agnostic: product and colour cannot change which image is shown"() {
      for (const placement of ["CENTER_FRONT", "CENTER_BACK"] as const) {
        const expected = placement === "CENTER_FRONT" ? FRONT_TEE : BACK_TEE;
        for (const product of ["FITTED", "OVERSIZED", "CUSTOM", null] as const) {
          for (const color of ["WHITE", "BLACK", "CUSTOM", null] as const) {
            assert.equal(
              getBespokeShirtImage(product, color, placement),
              expected,
              `expected the flat editor tee for ${product}/${color}/${placement}`,
            );
          }
        }
      }
    },

    "exactly 2 distinct image paths exist across every (product, color, side) combination -- one per side"() {
      const seen = new Set<string>();
      for (const product of ["FITTED", "OVERSIZED", "CUSTOM"] as const) {
        for (const color of ["WHITE", "BLACK", "CUSTOM"] as const) {
          for (const placement of ["CENTER_FRONT", "CENTER_BACK"] as const) {
            seen.add(getBespokeShirtImage(product, color, placement));
          }
        }
      }
      assert.deepEqual(
        [...seen].sort(),
        [FRONT_TEE, BACK_TEE].sort(),
        `expected exactly the two flat editor tees, got: ${[...seen].join(", ")}`,
      );
    },

    "null product/color still resolve to a real path, not a broken one"() {
      assert.equal(getBespokeShirtImage(null, null, "CENTER_FRONT"), FRONT_TEE);
      assert.equal(getBespokeShirtImage(null, null, "CENTER_BACK"), BACK_TEE);
    },

    "CUSTOM (Bespoke) product/color resolve the same way -- Bespoke designs on the same flat tee"() {
      assert.equal(getBespokeShirtImage("CUSTOM", "CUSTOM", "CENTER_FRONT"), FRONT_TEE);
      assert.equal(getBespokeShirtImage("CUSTOM", "CUSTOM", "CENTER_BACK"), BACK_TEE);
    },

    "never resolves to one of the photographed-model templates -- those belong to the preview/render, not the editor"() {
      const modelTemplates = [
        "TGFM White.png", "TGFM Black.png", "TGFM White Back.png", "TGFM Black Back.png",
        "Oversized White.png", "Oversized Black.png", "Oversized White Back.png", "Oversized Black Back.png",
      ];
      for (const product of ["FITTED", "OVERSIZED", "CUSTOM"] as const) {
        for (const color of ["WHITE", "BLACK", "CUSTOM"] as const) {
          for (const placement of ["CENTER_FRONT", "CENTER_BACK", "LEFT_SLEEVE", "FULL_BACK"] as const) {
            const src = getBespokeShirtImage(product, color, placement);
            for (const template of modelTemplates) {
              assert.ok(
                !src.endsWith(template),
                `editor surface resolved to model template ${template} for ${product}/${color}/${placement}`,
              );
            }
          }
        }
      }
    },

    "is a pure function: identical input produces byte-identical output every call (no hidden state/caching bug)"() {
      const a = getBespokeShirtImage("OVERSIZED", "BLACK", "FULL_BACK");
      const b = getBespokeShirtImage("OVERSIZED", "BLACK", "FULL_BACK");
      assert.equal(a, b);
    },
  });
}
