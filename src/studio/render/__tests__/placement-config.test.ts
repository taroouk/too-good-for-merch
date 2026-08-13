// file: src/studio/render/__tests__/placement-config.test.ts
import assert from "node:assert/strict";
import {
  getGarmentTemplate,
  getPlacementBox,
  getPlacementSide,
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
  });
}
