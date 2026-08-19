// file: src/studio/render/__tests__/garment-bbox-detection.test.ts
//
// Covers detectGarmentBBox() -- the two detection strategies it picks
// between (exact alpha-scan for a genuinely transparent template; a
// border-flood-fill for an opaque photoreal image) and the plausibility
// guards that reject a degenerate detection rather than feeding a garbage
// bbox into remapResolvedPlacementToGarmentBBox.
//
// The opaque-image detector used to call sharp's trim(), which failed on a
// real Gemini generation: a white garment on a white/near-white background
// with a subtle lighting vignette (measured ~30-unit corner-to-corner
// drift, invisible per-pixel) exceeded trim()'s single-fixed-reference
// threshold before reaching the true garment edge, reporting a garment
// ~65% wider than 4 other identical-input generations. Root-caused by
// diffing the failing run's raw pixels against a correct run's via
// scripts/investigate-geometry.mjs (see garment-bbox.ts's own comments for
// the full writeup). The border-flood-fill tests below reproduce that
// exact failure mode synthetically, plus the categories it must also
// handle: black garments, other background colours, and edge-adjacent
// subjects.
import assert from "node:assert/strict";
import sharp from "sharp";
import { detectGarmentBBox } from "../garment-bbox";
import { RendererError } from "../errors";
import { runSuite } from "./test-harness";

async function transparentCanvasWithOpaqueRect(
  canvasSize: number,
  rect: { left: number; top: number; width: number; height: number },
  color: { r: number; g: number; b: number } = { r: 255, g: 0, b: 0 },
) {
  const rectBuf = await sharp({
    create: { width: rect.width, height: rect.height, channels: 4, background: { ...color, alpha: 1 } },
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

async function opaqueCanvasWithRect(
  canvasSize: number,
  rect: { left: number; top: number; width: number; height: number },
  background: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 },
  color: { r: number; g: number; b: number } = { r: 0, g: 0, b: 255 },
) {
  const rectBuf = await sharp({
    create: { width: rect.width, height: rect.height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: canvasSize, height: canvasSize, channels: 3, background },
  })
    .composite([{ input: rectBuf, left: rect.left, top: rect.top }])
    .png()
    .toBuffer();
}

// A diagonal gradient background -- modelled on the real failing
// generation's measured corner colours (top-left ~[229,230,230], bottom-
// right ~[201,200,194]). Per-pixel step across a 500px canvas is ~0.06
// units, utterly invisible and far below ADJACENT_STEP_THRESHOLD, but the
// cumulative corner-to-corner drift (~30 units) exceeds the OLD trim()
// threshold of 24 -- exactly what made trim() fail on the real image.
async function gradientCanvasWithRect(
  canvasSize: number,
  rect: { left: number; top: number; width: number; height: number },
  color: { r: number; g: number; b: number },
) {
  const channels = 3;
  const raw = Buffer.alloc(canvasSize * canvasSize * channels);
  const from = { r: 229, g: 230, b: 230 };
  const to = { r: 201, g: 200, b: 194 };
  for (let y = 0; y < canvasSize; y++) {
    for (let x = 0; x < canvasSize; x++) {
      const t = (x + y) / (2 * (canvasSize - 1));
      const idx = (y * canvasSize + x) * channels;
      raw[idx] = Math.round(from.r + (to.r - from.r) * t);
      raw[idx + 1] = Math.round(from.g + (to.g - from.g) * t);
      raw[idx + 2] = Math.round(from.b + (to.b - from.b) * t);
    }
  }
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const idx = (y * canvasSize + x) * channels;
      raw[idx] = color.r;
      raw[idx + 1] = color.g;
      raw[idx + 2] = color.b;
    }
  }
  return sharp(raw, { raw: { width: canvasSize, height: canvasSize, channels } }).png().toBuffer();
}

export async function runAll() {
  return runSuite("garment-bbox-detection", {
    async "detects an exact bbox via alpha-scan for a genuinely transparent image"() {
      const rect = { left: 150, top: 200, width: 100, height: 80 };
      const image = await transparentCanvasWithOpaqueRect(500, rect);
      const bbox = await detectGarmentBBox(image);
      assert.equal(bbox.method, "alpha-scan");
      assert.equal(bbox.left, rect.left);
      assert.equal(bbox.top, rect.top);
      assert.equal(bbox.width, rect.width);
      assert.equal(bbox.height, rect.height);
    },

    async "detects an exact bbox via border-flood-fill for an opaque image with a uniform background"() {
      const rect = { left: 200, top: 150, width: 120, height: 90 };
      const image = await opaqueCanvasWithRect(500, rect);
      const bbox = await detectGarmentBBox(image);
      assert.equal(bbox.method, "border-flood-fill");
      assert.equal(bbox.left, rect.left);
      assert.equal(bbox.top, rect.top);
      assert.equal(bbox.width, rect.width);
      assert.equal(bbox.height, rect.height);
    },

    async "falls back to border-flood-fill for an image that carries an alpha channel but is opaque everywhere (Gemini's actual output shape)"() {
      // ensureAlpha() (used throughout the compositor) adds a fully-opaque
      // alpha channel to an otherwise opaque image -- hasAlpha becomes true
      // with no real transparency anywhere, exactly like Gemini's output.
      const rect = { left: 200, top: 150, width: 120, height: 90 };
      const opaque = await opaqueCanvasWithRect(500, rect);
      const withAlpha = await sharp(opaque).ensureAlpha().png().toBuffer();
      const meta = await sharp(withAlpha).metadata();
      assert.equal(meta.hasAlpha, true);

      const bbox = await detectGarmentBBox(withAlpha);
      assert.equal(bbox.method, "border-flood-fill");
      assert.equal(bbox.left, rect.left);
      assert.equal(bbox.top, rect.top);
    },

    // REGRESSION: the exact white-on-white failure that motivated this fix.
    async "detects the correct bbox against a gradient/vignette background that would defeat a fixed-reference trim (the real white-on-white failure)"() {
      const rect = { left: 180, top: 140, width: 130, height: 220 };
      const image = await gradientCanvasWithRect(500, rect, { r: 10, g: 10, b: 200 });
      const bbox = await detectGarmentBBox(image);
      assert.equal(bbox.method, "border-flood-fill");
      assert.equal(bbox.left, rect.left);
      assert.equal(bbox.top, rect.top);
      assert.equal(bbox.width, rect.width);
      assert.equal(bbox.height, rect.height);
    },

    async "detects a black garment on a light background"() {
      const rect = { left: 160, top: 120, width: 180, height: 260 };
      const image = await opaqueCanvasWithRect(500, rect, { r: 245, g: 245, b: 245 }, { r: 5, g: 5, b: 5 });
      const bbox = await detectGarmentBBox(image);
      assert.equal(bbox.left, rect.left);
      assert.equal(bbox.top, rect.top);
      assert.equal(bbox.width, rect.width);
      assert.equal(bbox.height, rect.height);
    },

    async "detects a light garment against a distinctly different (non-white) coloured background"() {
      const rect = { left: 140, top: 100, width: 150, height: 240 };
      const image = await opaqueCanvasWithRect(500, rect, { r: 60, g: 90, b: 140 }, { r: 240, g: 240, b: 235 });
      const bbox = await detectGarmentBBox(image);
      assert.equal(bbox.left, rect.left);
      assert.equal(bbox.top, rect.top);
      assert.equal(bbox.width, rect.width);
      assert.equal(bbox.height, rect.height);
    },

    async "unions disconnected subject fragments into one bbox (fine hair-like detail against a light background, not just the largest solid blob)"() {
      // A solid "torso" plus several small, PIXEL-DISCONNECTED "hair
      // strand" fragments well above it -- the real failure mode a
      // largest-connected-component approach hits (thin strands fragment
      // into many disconnected pieces at this threshold and get dropped,
      // cropping the head off). The correct bbox spans from the topmost
      // strand to the bottom of the torso.
      const canvasSize = 500;
      const torso = { left: 180, top: 260, width: 140, height: 200 };
      const strands = [
        { left: 220, top: 40, width: 4, height: 60 },
        { left: 250, top: 35, width: 4, height: 65 },
        { left: 280, top: 42, width: 4, height: 58 },
      ];
      const rects = [torso, ...strands];
      const overlays = await Promise.all(
        rects.map(async (r) => ({
          input: await sharp({ create: { width: r.width, height: r.height, channels: 3, background: { r: 20, g: 20, b: 20 } } })
            .png()
            .toBuffer(),
          left: r.left,
          top: r.top,
        })),
      );
      const image = await sharp({ create: { width: canvasSize, height: canvasSize, channels: 3, background: { r: 250, g: 250, b: 250 } } })
        .composite(overlays)
        .png()
        .toBuffer();

      const bbox = await detectGarmentBBox(image);
      // Topmost strand's top edge through the torso's bottom edge, spanning
      // the leftmost strand/torso edge through the rightmost.
      assert.equal(bbox.top, 35);
      assert.equal(bbox.left, 180);
      assert.equal(bbox.top + bbox.height, torso.top + torso.height);
      assert.equal(bbox.left + bbox.width, torso.left + torso.width);
    },

    async "detects a subject positioned close to (but not touching) the canvas edge"() {
      const rect = { left: 3, top: 3, width: 120, height: 90 };
      const image = await opaqueCanvasWithRect(500, rect);
      const bbox = await detectGarmentBBox(image);
      assert.equal(bbox.left, rect.left);
      assert.equal(bbox.top, rect.top);
      assert.equal(bbox.width, rect.width);
      assert.equal(bbox.height, rect.height);
    },

    // REGRESSION: previously this glitch (a solid-colour void reaching the
    // canvas edges, observed on a real Gemini generation) inflated the
    // trim()-based bbox to near the full canvas and had to be rejected
    // outright. The border-flood-fill correctly recognises the void as
    // border-connected background (uniform colour, touches the edges) and
    // excludes it, finding the true subject instead of needing to error.
    async "excludes an edge-touching solid-colour void (rendering-defect glitch) from the detected bbox instead of being fooled by it"() {
      const subject = { left: 50, top: 50, width: 150, height: 400 };
      const subjectBuf = await sharp({ create: { width: subject.width, height: subject.height, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer();
      const voidBuf = await sharp({ create: { width: 300, height: 500, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
      const image = await sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 255, g: 255, b: 255 } } })
        .composite([
          { input: subjectBuf, left: subject.left, top: subject.top },
          { input: voidBuf, left: 200, top: 0 }, // touches top, right, and bottom edges
        ])
        .png()
        .toBuffer();

      const bbox = await detectGarmentBBox(image);
      assert.equal(bbox.left, subject.left);
      assert.equal(bbox.top, subject.top);
      assert.equal(bbox.width, subject.width);
      assert.equal(bbox.height, subject.height);
    },

    async "rejects a degenerate (implausibly tiny) detection instead of returning garbage"() {
      // A 2x2 opaque dot on an otherwise fully transparent 800x800 canvas --
      // technically detectable, but far too small to plausibly be "the
      // garment" in a real generated photo.
      const image = await transparentCanvasWithOpaqueRect(800, { left: 400, top: 400, width: 2, height: 2 });
      await assert.rejects(() => detectGarmentBBox(image), RendererError);
    },

    async "rejects a subject with no discernible background margin at all instead of returning garbage"() {
      // Subject fills the canvas edge-to-edge with only a 1px border --
      // there's no meaningful background to anchor detection to.
      const rect = { left: 1, top: 1, width: 498, height: 498 };
      const image = await opaqueCanvasWithRect(500, rect);
      await assert.rejects(() => detectGarmentBBox(image), RendererError);
    },
  });
}
