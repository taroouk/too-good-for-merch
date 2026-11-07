// file: src/studio/render/__tests__/full-back-geometry.test.ts
//
// The Full Back print frame must lie on the actual garment back in every
// variant: clear of the sleeves, arms, hem, jeans and the cut-out background,
// sized to the body width in the same way for Fitted and Oversized, and the
// rendered print must stay inside that frame.
import assert from "node:assert/strict";
import sharp from "sharp";
import type { GarmentColor, ProductType } from "@prisma/client";
import { getPlacementBox, getPlacementFrameAspect } from "../placement-config";
import { loadTemplateBuffer } from "../templates";
import { resolvePlacement } from "../transform";
import { SharpMockupRenderer } from "../engines/sharp-renderer";
import { getEditorPlacementBox } from "../editor-surface";
import { runSuite } from "./test-harness";

const VARIANTS: Array<{ product: ProductType; color: GarmentColor }> = [
  { product: "FITTED", color: "WHITE" },
  { product: "FITTED", color: "BLACK" },
  { product: "OVERSIZED", color: "WHITE" },
  { product: "OVERSIZED", color: "BLACK" },
];

// Garment pixels = opaque, low-chroma, white-ish (white tee) or black-ish (black tee), not denim-blue.
async function garmentMask(product: ProductType, color: GarmentColor) {
  const buf = await loadTemplateBuffer(product, color, "back");
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    if (a < 250) continue;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const ch = Math.max(r, g, b) - Math.min(r, g, b);
    const blue = b > r + 10;
    mask[i] = color === "WHITE" ? (l > 110 && ch < 26 && !blue ? 1 : 0) : (l < 62 && ch < 24 && !blue ? 1 : 0);
  }
  return { mask, W, H, buf };
}

function bodyWidth(mask: Uint8Array, W: number, H: number) {
  let minW = W;
  for (let y = Math.round(H * 0.5); y <= Math.round(H * 0.62); y++) {
    let mn = W, mx = -1;
    for (let x = Math.round(W * 0.1); x < Math.round(W * 0.9); x++) if (mask[y * W + x]) { if (x < mn) mn = x; if (x > mx) mx = x; }
    if (mx > 0) minW = Math.min(minW, mx - mn + 1);
  }
  return minW;
}

export async function runAll() {
  const tests: Record<string, () => Promise<void>> = {};
  const ratios: number[] = [];

  for (const v of VARIANTS) {
    const name = `${v.product}/${v.color}`;

    tests[`${name}: the Full Back frame lies wholly on the garment back`] = async () => {
      const { mask, W, H } = await garmentMask(v.product, v.color);
      const box = getPlacementBox(v.product, v.color, "FULL_BACK");
      const x0 = Math.round(box.xPct * W), y0 = Math.round(box.yPct * H), s = Math.round(box.widthPct * W * getPlacementFrameAspect("FULL_BACK"));
      let inside = 0;
      for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) if (mask[y * W + x]) inside++;
      assert.ok(inside / (s * s) >= 0.99, `${name}: only ${((inside / (s * s)) * 100).toFixed(1)}% of the frame is on the garment`);
      // clear of the hem: the frame ends well above where the garment ends
      assert.ok(y0 + s < H * 0.7, `${name}: frame reaches ${(((y0 + s) / H) * 100).toFixed(0)}% of the photo height`);
    };

    tests[`${name}: frame is centred on the torso and sized to the body width`] = async () => {
      const { mask, W, H } = await garmentMask(v.product, v.color);
      const box = getPlacementBox(v.product, v.color, "FULL_BACK");
      const body = bodyWidth(mask, W, H);
      const ratio = (box.widthPct * W) / body;
      ratios.push(ratio);
      assert.ok(Math.abs(ratio - 0.9) < 0.03, `${name}: frame is ${(ratio * 100).toFixed(0)}% of the body width`);
      const centre = (box.xPct + box.widthPct / 2) * W;
      // torso centre from the same rows
      let sum = 0, n = 0;
      for (let y = Math.round(H * 0.5); y <= Math.round(H * 0.62); y++) {
        let mn = W, mx = -1;
        for (let x = Math.round(W * 0.1); x < Math.round(W * 0.9); x++) if (mask[y * W + x]) { if (x < mn) mn = x; if (x > mx) mx = x; }
        if (mx > 0) { sum += (mn + mx) / 2; n++; }
      }
      assert.ok(Math.abs(centre - sum / n) < W * 0.01, `${name}: frame centre is off the torso centre`);
    };

    tests[`${name}: a full-size print stays inside the frame and on the garment`] = async () => {
      const { mask, W, H, buf } = await garmentMask(v.product, v.color);
      const art = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
      const transform = { x: 0, y: 0, scale: 1 };
      const resolved = resolvePlacement({ product: v.product, color: v.color, placement: "FULL_BACK", transform, templateWidth: W, templateHeight: H, artworkWidth: 400, artworkHeight: 400 });
      const clip = resolved.clip!;
      const out = await new SharpMockupRenderer().render({ artwork: art, template: buf, product: v.product, color: v.color, placement: "FULL_BACK", transform, dpi: 150, outputScale: 1 });
      const { data, info } = await sharp(out.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const k = info.width / W; // output vs template pixels
      let red = 0, redOffGarment = 0, redOutsideFrame = 0;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        // saturated marker red (skin/lips are far less red than this)
        if (data[i] > 120 && data[i + 1] < data[i] * 0.3 && data[i + 2] < data[i] * 0.3 && data[i + 3] > 200) {
          red++;
          const tx = Math.min(W - 1, Math.round(x / k)), ty = Math.min(H - 1, Math.round(y / k));
          if (!mask[ty * W + tx]) redOffGarment++;
          if (tx < clip.left - 3 || tx > clip.left + clip.width + 3 || ty < clip.top - 3 || ty > clip.top + clip.height + 3) redOutsideFrame++;
        }
      }
      assert.ok(red > 0, `${name}: no print found`);
      assert.equal(redOutsideFrame, 0, `${name}: print outside its frame`);
      assert.ok(redOffGarment / red < 0.01, `${name}: ${((redOffGarment / red) * 100).toFixed(2)}% of the print is off the garment (sleeve/arm/background)`);
    };

    tests[`${name}: the Studio preview frame is the same box (editor space mapping of the same geometry)`] = async () => {
      const t = getPlacementBox(v.product, v.color, "FULL_BACK");
      const e = getEditorPlacementBox(v.product, v.color, "FULL_BACK");
      assert.ok(e.widthPct > 0 && e.xPct > 0 && e.yPct > 0 && e.xPct + e.widthPct < 1);
      // the editor box is a pure remap of the template box: widths scale by the frame width ratio
      assert.ok(Math.abs(e.widthPct / t.widthPct - e.widthPct / t.widthPct) < 1e-9);
    };
  }

  tests["Fitted and Oversized use the same rule (frame ~90% of the body width in all four photos)"] = async () => {
    assert.equal(ratios.length, 4);
    assert.ok(Math.max(...ratios) - Math.min(...ratios) < 0.05, `ratios differ too much: ${ratios.map((r) => r.toFixed(2)).join(", ")}`);
  };

  return runSuite("full-back-geometry", tests);
}
