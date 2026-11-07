// file: src/studio/render/__tests__/print-frame-clip.test.ts
//
// The print is cut off at the placement frame, exactly like the Studio
// preview clips the artwork to the dashed frame: a zoomed or tall artwork
// can never print outside it.
import assert from "node:assert/strict";
import sharp from "sharp";
import { remapResolvedPlacement, resolvePlacement } from "../transform";
import { getPlacementBox, getPlacementFrameAspect } from "../placement-config";
import { compositeArtworkOntoBase } from "../composite";
import type { ResolvedPlacement } from "../types";
import { runSuite } from "./test-harness";

async function solid(width: number, height: number, rgba: [number, number, number, number]) {
  return sharp({ create: { width, height, channels: 4, background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] / 255 } } })
    .png()
    .toBuffer();
}

async function pixel(image: Buffer, x: number, y: number) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

export async function runAll() {
  return runSuite("print-frame-clip", {
    "resolvePlacement reports the placement frame (box width x frame shape), whatever the artwork or scale"() {
      for (const scale of [1, 2]) {
        const resolved = resolvePlacement({
          product: "FITTED",
          color: "WHITE",
          placement: "CENTER_FRONT",
          transform: { x: 0, y: 0, scale },
          templateWidth: 1000,
          templateHeight: 1000,
          artworkWidth: 100,
          artworkHeight: 150, // taller than the wide frame
        });
        const box = getPlacementBox("FITTED", "WHITE", "CENTER_FRONT");
        assert.ok(resolved.clip);
        assert.equal(resolved.clip.left, Math.round(box.xPct * 1000));
        assert.equal(resolved.clip.top, Math.round(box.yPct * 1000));
        assert.equal(resolved.clip.width, Math.round(box.widthPct * 1000));
        assert.equal(resolved.clip.height, Math.round(box.widthPct * 1000 * getPlacementFrameAspect("CENTER_FRONT")));
      }
    },

    "remapResolvedPlacement carries the frame with the same factors"() {
      const resolved: ResolvedPlacement = { left: 400, top: 400, width: 200, height: 100, rotation: 0, clip: { left: 300, top: 350, width: 300, height: 120 } };
      const out = remapResolvedPlacement(resolved, 1000, 1000, 500, 500);
      assert.deepEqual(out.clip, { left: 150, top: 175, width: 150, height: 60 });
    },

    async "an artwork larger than its frame is cut off at the frame; pixels outside stay the garment"() {
      const base = await solid(400, 400, [255, 255, 255, 255]);
      const art = await solid(200, 200, [255, 0, 0, 255]);
      // Artwork box 100..300; frame 150..250 (both axes).
      const resolved: ResolvedPlacement = {
        left: 100, top: 100, width: 200, height: 200, rotation: 0,
        clip: { left: 150, top: 150, width: 100, height: 100 },
      };
      const out = await compositeArtworkOntoBase(base, art, resolved, null);
      assert.deepEqual(await pixel(out, 200, 200), [255, 0, 0]); // inside the frame
      assert.deepEqual(await pixel(out, 120, 200), [255, 255, 255]); // artwork, but outside the frame
      assert.deepEqual(await pixel(out, 200, 280), [255, 255, 255]);
      assert.deepEqual(await pixel(out, 149, 149), [255, 255, 255]);
      assert.deepEqual(await pixel(out, 249, 249), [255, 0, 0]);
      assert.deepEqual(await pixel(out, 251, 251), [255, 255, 255]);
    },

    async "an artwork entirely outside its frame prints nothing"() {
      const base = await solid(300, 300, [255, 255, 255, 255]);
      const art = await solid(50, 50, [255, 0, 0, 255]);
      const resolved: ResolvedPlacement = { left: 10, top: 10, width: 50, height: 50, rotation: 0, clip: { left: 200, top: 200, width: 50, height: 50 } };
      const out = await compositeArtworkOntoBase(base, art, resolved, null);
      assert.deepEqual(await pixel(out, 30, 30), [255, 255, 255]);
    },

    async "ink never lands on the transparent cut-out around the garment (print stays on the garment)"() {
      // Left half of the base is garment (opaque white), right half is the transparent cut-out.
      const half = await sharp({ create: { width: 100, height: 200, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
      const base = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: half, left: 0, top: 0 }])
        .png()
        .toBuffer();
      const art = await solid(120, 120, [255, 0, 0, 255]);
      // The print straddles the garment edge (x=100): 40..160.
      const out = await compositeArtworkOntoBase(base, art, { left: 40, top: 40, width: 120, height: 120, rotation: 0 }, null);
      const meta = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => { const i = (y * meta.info.width + x) * 4; return [meta.data[i], meta.data[i + 1], meta.data[i + 2], meta.data[i + 3]]; };
      assert.deepEqual(at(70, 100), [255, 0, 0, 255]); // on the garment: printed
      assert.equal(at(130, 100)[3], 0); // over the cut-out: still fully transparent
      assert.equal(at(101, 100)[3], 0);
    },

    async "without a frame the composite is unchanged (no clipping)"() {
      const base = await solid(200, 200, [255, 255, 255, 255]);
      const art = await solid(100, 100, [0, 0, 255, 255]);
      const out = await compositeArtworkOntoBase(base, art, { left: 50, top: 50, width: 100, height: 100, rotation: 0 }, null);
      assert.deepEqual(await pixel(out, 60, 60), [0, 0, 255]);
    },
  });
}
