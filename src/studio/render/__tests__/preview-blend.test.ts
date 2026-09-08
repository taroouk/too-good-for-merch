// file: src/studio/render/__tests__/preview-blend.test.ts
import assert from "node:assert/strict";
import sharp from "sharp";
import { previewArtworkBlend } from "../preview-blend";
import { runSuite } from "./test-harness";

const GARMENT_COLORS = ["WHITE", "BLACK", "NAVY", "GREY", "BEIGE", null, undefined];

export async function runAll() {
  return runSuite("render/preview-blend", {
    "the preview never applies a blend mode, for any garment color"() {
      for (const color of GARMENT_COLORS) {
        const blend = previewArtworkBlend(color);
        assert.equal(blend.mixBlendMode, "normal", `blend mode for ${String(color)}`);
      }
    },

    // P3-21b regression: WHITE previously got multiply + opacity 0.95, so the
    // customer approved a darker image than the one that actually printed.
    "the preview never reduces opacity, for any garment color"() {
      for (const color of GARMENT_COLORS) {
        assert.equal(previewArtworkBlend(color).opacity, 1, `opacity for ${String(color)}`);
      }
    },

    "WHITE is blended identically to every other garment color"() {
      const white = previewArtworkBlend("WHITE");
      for (const color of GARMENT_COLORS) {
        assert.deepEqual(previewArtworkBlend(color), white, `blend for ${String(color)}`);
      }
    },

    // Pins the other half of the invariant: that the server really does
    // composite alpha-over at full opacity, so "normal"/1 is the correct
    // preview equivalent. If compositeArtworkOntoBase ever gains a `blend`
    // option, this fails and the preview must be re-aligned with it.
    async "the server compositor is plain alpha-over at full opacity"() {
      const base = await sharp({
        create: { width: 4, height: 4, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      })
        .png()
        .toBuffer();
      const artwork = await sharp({
        create: { width: 4, height: 4, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 0.5 } },
      })
        .png()
        .toBuffer();

      const composited = await sharp(base)
        .composite([{ input: artwork, left: 0, top: 0 }])
        .raw()
        .toBuffer();
      const multiplied = await sharp(base)
        .composite([{ input: artwork, left: 0, top: 0, blend: "multiply" }])
        .raw()
        .toBuffer();

      // alpha-over of 50%-alpha mid-grey onto white: 255*0.5 + 128*0.5 ~= 191.
      assert.ok(
        Math.abs(composited[0] - 191) <= 1,
        `expected alpha-over (~191), got ${composited[0]}`,
      );
      assert.notEqual(composited[0], multiplied[0]);
    },
  });
}
