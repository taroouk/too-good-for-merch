// file: src/studio/render/__tests__/placement-config.test.ts
import assert from "node:assert/strict";
import {
  getGarmentTemplate,
  getPlacementBox,
  getPlacementSide,
  getTemplateAspectRatio,
} from "../placement-config";
import { runSuite } from "./test-harness";

const PRODUCTS = ["FITTED", "OVERSIZED"] as const;
const COLORS = ["BLACK", "WHITE"] as const;
const PLACEMENTS = [
  "LEFT_CHEST",
  "RIGHT_CHEST",
  "RIGHT_SLEEVE",
  "LEFT_SLEEVE",
  "CENTER_FRONT",
  "FULL_FRONT",
  "CENTER_BACK",
  "FULL_BACK",
] as const;
const BACK_PLACEMENTS = new Set(["CENTER_BACK", "FULL_BACK"]);

export async function runAll() {
  return runSuite("placement-config", {
    "every product x color x placement combination returns a valid box"() {
      for (const product of PRODUCTS) {
        for (const color of COLORS) {
          for (const placement of PLACEMENTS) {
            const box = getPlacementBox(product, color, placement);
            assert.ok(box, `expected a box for ${product}/${color}/${placement}`);
            assert.ok(
              box.xPct >= 0 && box.xPct <= 1,
              `xPct out of [0,1] for ${product}/${placement}: ${box.xPct}`,
            );
            assert.ok(
              box.yPct >= 0 && box.yPct <= 1,
              `yPct out of [0,1] for ${product}/${placement}: ${box.yPct}`,
            );
            assert.ok(
              box.widthPct > 0 && box.widthPct <= 1,
              `widthPct out of (0,1] for ${product}/${placement}: ${box.widthPct}`,
            );
          }
        }
      }
    },

    "getPlacementSide matches placement naming (BACK -> back, else front)"() {
      for (const placement of PLACEMENTS) {
        const side = getPlacementSide(placement);
        const expected = BACK_PLACEMENTS.has(placement) ? "back" : "front";
        assert.equal(side, expected, `side mismatch for ${placement}`);
      }
    },

    "getGarmentTemplate resolves a file for every product x color x side"() {
      for (const product of PRODUCTS) {
        for (const color of COLORS) {
          for (const side of ["front", "back"] as const) {
            const template = getGarmentTemplate(product, color, side);
            assert.ok(template.file.endsWith(".png"), `expected a .png template file, got ${template.file}`);
          }
        }
      }
    },

    "FITTED and OVERSIZED use different coordinates for the same placement"() {
      const fitted = getPlacementBox("FITTED", "WHITE", "CENTER_FRONT");
      const oversized = getPlacementBox("OVERSIZED", "WHITE", "CENTER_FRONT");
      assert.notEqual(
        fitted.widthPct,
        oversized.widthPct,
        "expected FITTED and OVERSIZED to have distinct tuned placement boxes",
      );
    },

    // REGRESSION: the preview container (TryOn3DPreview.tsx / BespokeModal.tsx)
    // used to be hardcoded to aspect-ratio 1/1 for BOTH sides, which silently
    // pillarboxed a non-square back photo (object-fit: contain). The current
    // generation of template photos is neither side a clean square any more
    // (both front and back are tightly-cropped portrait photos in the
    // ~0.47-0.55 width/height range -- see TEMPLATE_ASPECT_RATIO's own
    // comment in placement-config.ts) -- this just locks in "portrait, not
    // square" for both sides so getTemplateAspectRatio's fallback value can
    // never silently drift back to a hardcoded 1:1.
    "getTemplateAspectRatio: both front and back are portrait, neither is a square"() {
      assert.ok(
        getTemplateAspectRatio("front") < 1,
        "front's aspect ratio must be < 1 (portrait, narrower than tall) -- a value of 1 here would silently reintroduce the pillarboxing bug",
      );
      assert.ok(
        getTemplateAspectRatio("back") < 1,
        "back's aspect ratio must be < 1 (portrait, narrower than tall) -- a value of 1 here would silently reintroduce the pillarboxing bug",
      );
    },
  });
}
