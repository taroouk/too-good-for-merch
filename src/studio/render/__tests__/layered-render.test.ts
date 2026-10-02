// file: src/studio/render/__tests__/layered-render.test.ts
//
// Multi-artwork print mockups (renderLayeredMockup): several artworks on
// one garment side, against the REAL template photo. Checked by detecting
// two differently coloured marker artworks in the output -- each must land
// where its own placement resolves, and a single layer must produce
// exactly the single-artwork renderer's bytes.
import assert from "node:assert/strict";
import sharp from "sharp";
import { SharpMockupRenderer, renderLayeredMockup } from "../engines/sharp-renderer";
import { loadTemplateBuffer } from "../templates";
import { runSuite } from "./test-harness";

async function solid(r: number, g: number, b: number, w = 120, h = 120) {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: 1 } } })
    .png()
    .toBuffer();
}

// Fraction of the output (by x) where pixels close to `rgb` sit -- returns
// the centre of their bounding box as fractions of width/height.
async function markerCentre(png: Buffer, rgb: [number, number, number]) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const o = (y * info.width + x) * 4;
      if (Math.abs(data[o] - rgb[0]) < 40 && Math.abs(data[o + 1] - rgb[1]) < 40 && Math.abs(data[o + 2] - rgb[2]) < 40) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { cx: (minX + maxX) / 2 / info.width, cy: (minY + maxY) / 2 / info.height };
}


export async function runAll() {
  return runSuite("render/layered-render", {
    async "a single layer renders byte-identically to the single-artwork renderer"() {
      const template = await loadTemplateBuffer("FITTED", "WHITE", "front");
      const artwork = await solid(30, 90, 200);
      const transform = { x: 0.02, y: -0.01, scale: 1, rotation: 0 };
      const single = await new SharpMockupRenderer().render({
        artwork, template, product: "FITTED", color: "WHITE", placement: "CENTER_FRONT", transform, dpi: 150,
      });
      const layered = await renderLayeredMockup({
        template, product: "FITTED", color: "WHITE", dpi: 150,
        layers: [{ artwork, placement: "CENTER_FRONT", transform }],
      });
      assert.equal(Buffer.compare(single.data, layered.data), 0);
    },

    async "two artworks each land on their own placement"() {
      const template = await loadTemplateBuffer("FITTED", "WHITE", "front");
      const magenta = await solid(255, 0, 255);
      const green = await solid(0, 200, 0);
      const out = await renderLayeredMockup({
        template, product: "FITTED", color: "WHITE", dpi: 150,
        layers: [
          { artwork: magenta, placement: "LEFT_CHEST", transform: { x: 0, y: 0, scale: 1, rotation: 0 } },
          { artwork: green, placement: "RIGHT_CHEST", transform: { x: 0, y: 0, scale: 1, rotation: 0 } },
        ],
      });
      const left = await markerCentre(out.data, [255, 0, 255]);
      const right = await markerCentre(out.data, [0, 200, 0]);
      assert.ok(left, "left-chest artwork missing from output");
      assert.ok(right, "right-chest artwork missing from output");
      // Left Chest is on the viewer's left, Right Chest on the right, same height.
      assert.ok(left!.cx < 0.5 && right!.cx > 0.5, `expected left<0.5<right, got ${left!.cx} / ${right!.cx}`);
      assert.ok(Math.abs(left!.cy - right!.cy) < 0.03, `chests at different heights: ${left!.cy} vs ${right!.cy}`);
    },

    async "output size matches the single-artwork renderer for the same side"() {
      const template = await loadTemplateBuffer("OVERSIZED", "BLACK", "back");
      const a = await solid(255, 0, 255);
      const single = await new SharpMockupRenderer().render({
        artwork: a, template, product: "OVERSIZED", color: "BLACK", placement: "FULL_BACK",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 }, dpi: 150,
      });
      const layered = await renderLayeredMockup({
        template, product: "OVERSIZED", color: "BLACK", dpi: 150,
        layers: [
          { artwork: a, placement: "FULL_BACK", transform: { x: 0, y: 0, scale: 1, rotation: 0 } },
          { artwork: a, placement: "CENTER_BACK", transform: { x: 0, y: 0, scale: 0.5, rotation: 0 } },
        ],
      });
      assert.equal(layered.width, single.width);
      assert.equal(layered.height, single.height);
    },
  });
}
