// file: src/studio/render/__tests__/aspect-ratio-geometry.test.ts
//
// Regression tests for P1-11: compositeArtworkOntoBase trims artwork to its
// visible (non-transparent) content, then resizes with fit:"fill" into the
// resolved placement box. If that box were sized off the RAW upload's
// aspect ratio instead of the TRIMMED content's aspect ratio, asymmetric
// transparent padding would make "fill" stretch/squash the visible
// artwork. These tests render a small solid-color rectangle inside a
// larger transparent canvas (varying how the padding is distributed) and
// assert the ACTUAL on-canvas pixel bounding box of that rectangle keeps
// its original aspect ratio after compositing -- not merely that
// rendering completes without error.
import assert from "node:assert/strict";
import sharp from "sharp";
import { SharpMockupRenderer } from "../engines/sharp-renderer";
import { BASELINE_RENDER_DPI } from "../transform";
import type { RenderRequest } from "../types";
import { runSuite } from "./test-harness";

async function solidPng(width: number, height: number, color: { r: number; g: number; b: number }) {
  return sharp({ create: { width, height, channels: 4, background: { ...color, alpha: 1 } } })
    .png()
    .toBuffer();
}

// Places a solid `rect`-sized red block inside a `canvas`-sized transparent
// PNG at (left, top) -- simulating an upload with transparent padding.
async function paddedArtwork(
  canvas: { width: number; height: number },
  rect: { width: number; height: number },
  offset: { left: number; top: number },
) {
  const red = await solidPng(rect.width, rect.height, { r: 255, g: 0, b: 0 });
  return sharp({
    create: { width: canvas.width, height: canvas.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: red, left: offset.left, top: offset.top }])
    .png()
    .toBuffer();
}

// Scans the full rendered output for red (artwork-colored) pixels and
// returns their bounding box in pixels.
async function redBBox(image: Buffer) {
  const { data, info } = await sharp(image).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const isRed = data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60 && data[i + 3] > 200;
      if (isRed) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  assert.ok(maxX >= minX && maxY >= minY, "expected to find red pixels in the render");
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function baseRequest(overrides: Partial<RenderRequest> = {}): Promise<RenderRequest> {
  const template = await solidPng(1000, 1000, { r: 255, g: 255, b: 255 });
  return {
    artwork: await solidPng(200, 100, { r: 255, g: 0, b: 0 }),
    template,
    product: "FITTED",
    color: "WHITE",
    placement: "CENTER_FRONT",
    transform: { x: 0, y: 0, scale: 1 },
    dpi: BASELINE_RENDER_DPI,
    ...overrides,
  };
}

const CONTENT_ASPECT = 100 / 50; // 2:1 rectangle used by every padded case below

export async function runAll() {
  const renderer = new SharpMockupRenderer();

  return runSuite("aspect-ratio-geometry", {
    async "normal (untrimmed) rectangular artwork keeps its aspect ratio"() {
      const req = await baseRequest({ artwork: await solidPng(200, 100, { r: 255, g: 0, b: 0 }) });
      const result = await renderer.render(req);
      const bbox = await redBBox(result.data);
      assert.ok(
        Math.abs(bbox.width / bbox.height - 2) < 0.02,
        `expected ~2:1, got ${bbox.width}x${bbox.height}`,
      );
    },

    async "symmetrically padded transparent artwork keeps its aspect ratio"() {
      const artwork = await paddedArtwork({ width: 300, height: 300 }, { width: 100, height: 50 }, { left: 100, top: 125 });
      const req = await baseRequest({ artwork });
      const result = await renderer.render(req);
      const bbox = await redBBox(result.data);
      assert.ok(
        Math.abs(bbox.width / bbox.height - CONTENT_ASPECT) < 0.02,
        `expected ~${CONTENT_ASPECT}:1, got ${bbox.width}x${bbox.height}`,
      );
    },

    async "asymmetrically padded transparent artwork does NOT distort the visible content"() {
      // Same 100x50 (2:1) red content, but placed hard against the top-left
      // corner of a much taller/wider transparent canvas -- all the padding
      // is on the right and bottom. The pre-fix code sized the placement
      // box off the canvas's own (1:1-ish) aspect ratio, stretching this
      // content toward square.
      const artwork = await paddedArtwork({ width: 400, height: 600 }, { width: 100, height: 50 }, { left: 0, top: 0 });
      const req = await baseRequest({ artwork });
      const result = await renderer.render(req);
      const bbox = await redBBox(result.data);
      assert.ok(
        Math.abs(bbox.width / bbox.height - CONTENT_ASPECT) < 0.02,
        `expected ~${CONTENT_ASPECT}:1, got ${bbox.width}x${bbox.height} (aspect ${(bbox.width / bbox.height).toFixed(2)})`,
      );
    },

    async "asymmetric padding on the back placement also keeps aspect ratio"() {
      const artwork = await paddedArtwork({ width: 500, height: 200 }, { width: 100, height: 50 }, { left: 350, top: 130 });
      const req = await baseRequest({ artwork, placement: "CENTER_BACK" });
      const result = await renderer.render(req);
      const bbox = await redBBox(result.data);
      assert.ok(
        Math.abs(bbox.width / bbox.height - CONTENT_ASPECT) < 0.02,
        `expected ~${CONTENT_ASPECT}:1, got ${bbox.width}x${bbox.height}`,
      );
    },

    async "asymmetric padding on a non-square placement (FULL_FRONT) keeps aspect ratio"() {
      const artwork = await paddedArtwork({ width: 300, height: 900 }, { width: 100, height: 50 }, { left: 5, top: 800 });
      const req = await baseRequest({ artwork, placement: "FULL_FRONT" });
      const result = await renderer.render(req);
      const bbox = await redBBox(result.data);
      assert.ok(
        Math.abs(bbox.width / bbox.height - CONTENT_ASPECT) < 0.02,
        `expected ~${CONTENT_ASPECT}:1, got ${bbox.width}x${bbox.height}`,
      );
    },
  });
}
