// file: src/studio/render/__tests__/artwork-bounds.test.ts
//
// Covers trimToVisibleBounds() -- the artwork-bounds trim compositeArtworkOntoBase
// runs on the user's uploaded artwork before resizing it into the resolved
// placement box, so a PNG with transparent padding around a smaller logo
// doesn't have that padding silently stretched to fill the box (the
// artwork's own width/height, and therefore the user's configured scale,
// would otherwise describe the padded canvas, not the visible content).
//
// Deliberately does NOT reuse detectGarmentBBox's neighbor-connectivity
// requirement (hasAboveThresholdNeighbor) -- that exists to filter a defect
// specific to photographed GARMENTS (a 1px-wide PNG-export artifact with no
// real 2D extent). Arbitrary uploaded ARTWORK can legitimately be a single
// pixel, a thin hairline stroke, or a soft low-alpha shadow/glow with no
// "2D neighbor" of its own -- none of that should be treated as an
// artifact to discard. See garment-bbox.ts's scanAboveThresholdBBox
// (requireNeighbor=false for this call site) for the actual mechanism.
import assert from "node:assert/strict";
import sharp from "sharp";
import { trimToVisibleBounds } from "../garment-bbox";
import { RendererError } from "../errors";
import { runSuite } from "./test-harness";

async function transparentCanvasWithRect(
  canvasSize: number,
  rect: { left: number; top: number; width: number; height: number },
  color: { r: number; g: number; b: number } = { r: 20, g: 120, b: 200 },
  alpha = 255,
) {
  const rectBuf = await sharp({
    create: { width: rect.width, height: rect.height, channels: 4, background: { ...color, alpha: alpha / 255 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: canvasSize, height: canvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: rectBuf, left: rect.left, top: rect.top }])
    .png()
    .toBuffer();
}

export async function runAll() {
  return runSuite("artwork-bounds", {
    async "tightly-cropped PNG (no padding, alpha=255 everywhere) is returned unchanged"() {
      // A PNG can carry an alpha channel (hasAlpha=true) while being fully
      // opaque throughout -- exactly what an ensureAlpha()'d, already-tight
      // upload looks like. The no-op fast path should return the exact
      // same buffer, not a re-encoded equivalent.
      const image = await sharp({
        create: { width: 150, height: 90, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const trimmed = await trimToVisibleBounds(image);
      assert.equal(trimmed, image, "expected the exact same buffer reference (no-op fast path)");

      const meta = await sharp(trimmed).metadata();
      assert.equal(meta.width, 150);
      assert.equal(meta.height, 90);
    },

    async "PNG with large transparent padding is trimmed to the visible rect"() {
      const canvasSize = 400;
      const rect = { left: 200, top: 250, width: 80, height: 60 };
      const image = await transparentCanvasWithRect(canvasSize, rect);

      const trimmed = await trimToVisibleBounds(image);
      const meta = await sharp(trimmed).metadata();
      assert.equal(meta.width, rect.width);
      assert.equal(meta.height, rect.height);

      // The trimmed image should be solid content start-to-finish, not a
      // re-crop that still contains padding.
      const { data, info } = await sharp(trimmed).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
      for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) {
        const alpha = data[(y * info.width + x) * info.channels + 3];
        assert.ok(alpha > 200, `expected corner (${x},${y}) of the trimmed image to be visible content, got alpha=${alpha}`);
      }
    },

    async "semi-transparent soft edges above threshold are preserved, not clipped tighter than the true bounds"() {
      // A solid 100x100 core plus a uniform 10px "soft edge" ring at
      // alpha=40 (comfortably above ALPHA_SUBJECT_THRESHOLD=10, simulating
      // real anti-aliased/feathered edges) -- the trim must include the
      // full 120x120 footprint, not just the 100x100 solid core.
      const canvasSize = 300;
      const outerAlpha = 40 / 255;
      const outer = { left: 90, top: 90, width: 120, height: 120 };
      const inner = { left: 100, top: 100, width: 100, height: 100 };

      const outerBuf = await sharp({
        create: { width: outer.width, height: outer.height, channels: 4, background: { r: 0, g: 200, b: 0, alpha: outerAlpha } },
      }).png().toBuffer();
      const innerBuf = await sharp({
        create: { width: inner.width, height: inner.height, channels: 4, background: { r: 0, g: 200, b: 0, alpha: 1 } },
      }).png().toBuffer();

      const image = await sharp({
        create: { width: canvasSize, height: canvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([
          { input: outerBuf, left: outer.left, top: outer.top },
          { input: innerBuf, left: inner.left, top: inner.top },
        ])
        .png()
        .toBuffer();

      const trimmed = await trimToVisibleBounds(image);
      const meta = await sharp(trimmed).metadata();
      assert.equal(meta.width, outer.width, "soft edge ring must not be clipped off the width");
      assert.equal(meta.height, outer.height, "soft edge ring must not be clipped off the height");
    },

    async "artwork with an offset shadow/glow: bbox covers the full asymmetric footprint, not just the solid core"() {
      // A solid 60x60 logo plus a soft, semi-transparent "shadow" offset
      // down-and-right by 20px (a realistic drop-shadow), extending the
      // true footprint asymmetrically. The trim must cover the union of
      // both, not re-center or clip to the logo alone.
      const canvasSize = 300;
      const logo = { left: 100, top: 100, width: 60, height: 60 };
      const shadow = { left: 108, top: 108, width: 70, height: 70 };
      const shadowAlpha = 25 / 255;

      const shadowBuf = await sharp({
        create: { width: shadow.width, height: shadow.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: shadowAlpha } },
      }).png().toBuffer();
      const logoBuf = await sharp({
        create: { width: logo.width, height: logo.height, channels: 4, background: { r: 220, g: 20, b: 60, alpha: 1 } },
      }).png().toBuffer();

      const image = await sharp({
        create: { width: canvasSize, height: canvasSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([
          { input: shadowBuf, left: shadow.left, top: shadow.top },
          { input: logoBuf, left: logo.left, top: logo.top },
        ])
        .png()
        .toBuffer();

      // Union bbox of logo [100,100]-[160,160] and shadow [108,108]-[178,178]
      // is [100,100]-[178,178] -> 78x78, origin at the logo's own top-left
      // corner (the shadow starts later on both axes).
      const expectedWidth = 178 - 100;
      const expectedHeight = 178 - 100;

      const trimmed = await trimToVisibleBounds(image);
      const meta = await sharp(trimmed).metadata();
      assert.equal(meta.width, expectedWidth, "expected the union of logo + shadow, not the logo alone");
      assert.equal(meta.height, expectedHeight, "expected the union of logo + shadow, not the logo alone");

      // Confirm the crop ORIGIN is correct too, not just the size: pixel
      // (0,0) of the trimmed output must be the logo's own top-left corner
      // (opaque red), since the union's minX/minY come from the logo, not
      // the shadow.
      const { data } = await sharp(trimmed).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
      const [r, g, b, a] = data.subarray(0, 4);
      assert.ok(a > 200, `expected trimmed (0,0) to be opaque logo content, got alpha=${a}`);
      assert.ok(r > 150 && g < 60 && b < 100, `expected trimmed (0,0) to be the logo's red, got rgb(${r},${g},${b})`);
    },

    async "JPEG (no alpha channel) passes through unchanged"() {
      const image = await sharp({
        create: { width: 120, height: 80, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .jpeg()
        .toBuffer();

      const meta = await sharp(image).metadata();
      assert.equal(meta.hasAlpha, false);

      const trimmed = await trimToVisibleBounds(image);
      assert.equal(trimmed, image, "expected the exact same buffer reference -- no alpha channel means nothing to trim");
    },

    async "PNG without any real transparency (alpha=255 everywhere) is treated like a no-alpha image -- unchanged"() {
      const image = await sharp({
        create: { width: 64, height: 64, channels: 4, background: { r: 5, g: 5, b: 5, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const trimmed = await trimToVisibleBounds(image);
      const meta = await sharp(trimmed).metadata();
      assert.equal(meta.width, 64);
      assert.equal(meta.height, 64);
    },

    async "fully transparent artwork fails safely with a RendererError, not invalid geometry"() {
      const image = await sharp({
        create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .png()
        .toBuffer();

      await assert.rejects(() => trimToVisibleBounds(image), RendererError);
    },

    async "a legitimate 1x1 image is preserved, not mistaken for a defect/empty image"() {
      // Regression: reusing detectGarmentBBox's neighbor-connectivity
      // requirement here would reject ANY 1x1 image outright (it has no
      // neighbors in any direction), even though a single fully-opaque
      // pixel is entirely legitimate content, not a defect.
      const image = await sharp({
        create: { width: 1, height: 1, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();

      const trimmed = await trimToVisibleBounds(image);
      const meta = await sharp(trimmed).metadata();
      assert.equal(meta.width, 1);
      assert.equal(meta.height, 1);
    },
  });
}
