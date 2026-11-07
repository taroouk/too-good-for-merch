// file: src/studio/render/__tests__/drag-bounds.test.ts
//
// The artwork can be dragged anywhere inside its selected frame -- for ANY
// artwork shape. Bounds come from the artwork's real aspect, not from a
// frame-shaped stand-in.
import assert from "node:assert/strict";
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import { getDragBounds } from "../transform";
import { getPlacementBox, getPlacementFrameAspect, getPlacementSide, getTemplateAspectRatio } from "../placement-config";
import { runSuite } from "./test-harness";

const PLACEMENTS: PlacementType[] = ["FULL_FRONT", "CENTER_FRONT", "LEFT_CHEST", "RIGHT_CHEST", "FULL_BACK"];
const VARIANTS: Array<[ProductType, GarmentColor]> = [["FITTED", "WHITE"], ["FITTED", "BLACK"], ["OVERSIZED", "WHITE"], ["OVERSIZED", "BLACK"]];
const ASPECTS = [1, 2, 1.4, 0.5, 0.25]; // artwork height / width

// where the artwork lands (canvas-width units) for an offset, exactly as the client/server lay it out
function rect(product: ProductType, color: GarmentColor, placement: PlacementType, aa: number, scale: number, off: { x: number; y: number }) {
  const box = getPlacementBox(product, color, placement);
  const ca = getTemplateAspectRatio(getPlacementSide(placement));
  const top0 = box.yPct / ca;
  const w = box.widthPct * scale, h = box.widthPct * aa * scale;
  const cx = box.xPct + box.widthPct / 2 + off.x, cy = top0 + (box.widthPct * aa) / 2 + off.y;
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, frame: { x0: box.xPct, x1: box.xPct + box.widthPct, y0: top0, y1: top0 + box.widthPct * getPlacementFrameAspect(placement) } };
}

export async function runAll() {
  const eps = 1e-9;
  return runSuite("drag-bounds", {
    "without an aspect the bounds are the previous frame-shaped ones (square frame, scale 1 -> pinned)"() {
      const b = getDragBounds("FITTED", "WHITE", "FULL_FRONT", 1);
      assert.ok(Math.abs(b.x.min) < eps && Math.abs(b.x.max) < eps && Math.abs(b.y.min) < eps && Math.abs(b.y.max) < eps);
    },

    "a wide artwork in a square frame can slide up and down over the whole frame height, and not sideways"() {
      const box = getPlacementBox("FITTED", "WHITE", "FULL_FRONT");
      const aa = 0.25;
      const b = getDragBounds("FITTED", "WHITE", "FULL_FRONT", 1, aa);
      assert.ok(Math.abs(b.x.min) < eps && Math.abs(b.x.max) < eps);
      assert.ok(Math.abs(b.y.min) < eps);
      assert.ok(Math.abs(b.y.max - box.widthPct * (1 - aa)) < 1e-9, `y.max ${b.y.max}`);
    },

    "at both extremes of the bounds an artwork smaller than its frame lies wholly inside it (any shape, scale, placement, variant)"() {
      for (const [p, c] of VARIANTS) for (const pl of PLACEMENTS) for (const aa of ASPECTS) for (const scale of [0.4, 0.7, 1]) {
        const b = getDragBounds(p, c, pl, scale, aa);
        for (const off of [{ x: b.x.min, y: b.y.min }, { x: b.x.max, y: b.y.max }, { x: b.x.min, y: b.y.max }, { x: b.x.max, y: b.y.min }]) {
          const r = rect(p, c, pl, aa, scale, off);
          const wide = r.x1 - r.x0 > r.frame.x1 - r.frame.x0 + 1e-9, tall = r.y1 - r.y0 > r.frame.y1 - r.frame.y0 + 1e-9;
          if (!wide) assert.ok(r.x0 >= r.frame.x0 - 1e-9 && r.x1 <= r.frame.x1 + 1e-9, `${p}/${c}/${pl} aspect ${aa} scale ${scale}: leaves the frame horizontally`);
          if (!tall) assert.ok(r.y0 >= r.frame.y0 - 1e-9 && r.y1 <= r.frame.y1 + 1e-9, `${p}/${c}/${pl} aspect ${aa} scale ${scale}: leaves the frame vertically`);
        }
      }
    },

    "an artwork larger than its frame can be slid but never uncovers the frame"() {
      for (const [p, c] of VARIANTS) for (const pl of PLACEMENTS) for (const aa of ASPECTS) {
        const scale = 1.25;
        const b = getDragBounds(p, c, pl, scale, aa);
        for (const off of [{ x: b.x.min, y: b.y.min }, { x: b.x.max, y: b.y.max }]) {
          const r = rect(p, c, pl, aa, scale, off);
          const wide = r.x1 - r.x0 >= r.frame.x1 - r.frame.x0, tall = r.y1 - r.y0 >= r.frame.y1 - r.frame.y0;
          if (wide) assert.ok(r.x0 <= r.frame.x0 + 1e-9 && r.x1 >= r.frame.x1 - 1e-9, `${p}/${c}/${pl} aspect ${aa}: frame uncovered horizontally`);
          if (tall) assert.ok(r.y0 <= r.frame.y0 + 1e-9 && r.y1 >= r.frame.y1 - 1e-9, `${p}/${c}/${pl} aspect ${aa}: frame uncovered vertically`);
        }
      }
    },

    "the Studio's default fit (centred in the frame) is always inside the bounds"() {
      for (const [p, c] of VARIANTS) for (const pl of PLACEMENTS) for (const aa of ASPECTS) {
        const box = getPlacementBox(p, c, pl);
        const fa = getPlacementFrameAspect(pl);
        const scale = Math.min(1, fa / aa);
        if (scale < 0.4) continue; // clamped by the minimum scale, fit is best-effort
        const y = (box.widthPct * (fa - aa)) / 2;
        const b = getDragBounds(p, c, pl, scale, aa);
        assert.ok(y >= b.y.min - 1e-9 && y <= b.y.max + 1e-9, `${p}/${c}/${pl} aspect ${aa}: fit y ${y} outside [${b.y.min}, ${b.y.max}]`);
        assert.ok(0 >= b.x.min - 1e-9 && 0 <= b.x.max + 1e-9);
      }
    },
  });
}
