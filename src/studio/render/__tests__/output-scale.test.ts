// file: src/studio/render/__tests__/output-scale.test.ts
//
// MOCKUP_OUTPUT_SCALE: mockups are rendered at a larger size with the
// artwork composited at that size from its original pixels. The geometry is
// the same placement, just larger; outputScale 1 is the previous behaviour.
import assert from "node:assert/strict";
import sharp from "sharp";
import { SharpMockupRenderer } from "../engines/sharp-renderer";
import { loadTemplateBuffer } from "../templates";
import { scaleResolvedPlacement } from "../transform";
import { getTemplateReferenceWidth } from "../placement-config";
import type { ResolvedPlacement } from "../types";
import { runSuite } from "./test-harness";

async function redBBox(image: Buffer) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60 && data[i + 3] > 200) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export async function runAll() {
  return runSuite("output-scale", {
    "scaleResolvedPlacement scales position, size and frame together"() {
      const r: ResolvedPlacement = { left: 10, top: 20, width: 30, height: 40, rotation: 12, clip: { left: 5, top: 6, width: 50, height: 60 } };
      assert.deepEqual(scaleResolvedPlacement(r, 2), { left: 20, top: 40, width: 60, height: 80, rotation: 12, clip: { left: 10, top: 12, width: 100, height: 120 } });
      assert.deepEqual(scaleResolvedPlacement({ left: 1, top: 1, width: 1, height: 1, rotation: 0 }, 1), { left: 1, top: 1, width: 1, height: 1, rotation: 0 });
    },

    async "outputScale 2 renders at twice the reference size with the same placement"() {
      const renderer = new SharpMockupRenderer();
      const template = await loadTemplateBuffer("FITTED", "WHITE", "front");
      const artwork = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
      const base = { artwork, template, product: "FITTED" as const, color: "WHITE" as const, placement: "FULL_FRONT" as const, transform: { x: 0, y: 0, scale: 0.7 }, dpi: 150 };
      const one = await renderer.render(base);
      const two = await renderer.render({ ...base, outputScale: 2 });

      const refWidth = getTemplateReferenceWidth("FITTED", "front");
      assert.equal(one.width, refWidth);
      assert.equal(two.width, refWidth * 2);
      assert.ok(Math.abs(two.height - one.height * 2) <= 2);

      const a = await redBBox(one.data);
      const b = await redBBox(two.data);
      for (const key of ["left", "top", "width", "height"] as const) {
        assert.ok(Math.abs(b[key] - a[key] * 2) <= 4, `${key}: ${b[key]} vs 2x ${a[key] * 2}`);
      }
    },

    async "outputScale omitted or 1 is the original output"() {
      const renderer = new SharpMockupRenderer();
      const template = await loadTemplateBuffer("OVERSIZED", "BLACK", "front");
      const artwork = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
      const base = { artwork, template, product: "OVERSIZED" as const, color: "BLACK" as const, placement: "FULL_FRONT" as const, transform: { x: 0, y: 0, scale: 0.7 }, dpi: 150 };
      const a = await renderer.render(base);
      const b = await renderer.render({ ...base, outputScale: 1 });
      assert.equal(a.data.equals(b.data), true);
    },
  });
}
