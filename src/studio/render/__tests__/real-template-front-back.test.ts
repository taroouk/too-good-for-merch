// file: src/studio/render/__tests__/real-template-front-back.test.ts
//
// End-to-end geometry coverage against the REAL garment template files
// (not synthetic canvases) for both FRONT and BACK placements -- the exact
// gap the front/back accuracy audit found: sharp-renderer.test.ts,
// sharp-renderer.edge.test.ts, transform.test.ts, and golden-snapshot.test.ts
// are all front-only, and geometry-parity.test.ts's back cases used a fake
// uniform square template rather than the real 1024x1536 portrait back
// asset. This suite renders through the actual SharpMockupRenderer against
// the actual template PNGs, then independently re-detects where the
// artwork actually landed (a solid marker-colour rect, scanned for in the
// output -- the same "ground truth by detection" technique
// scripts/investigate-geometry.mjs uses against real Gemini output) and
// compares requested/resolved placement -> actual composited bounds within
// a stated tolerance. This validates the deterministic Print Mockup path
// end-to-end; it does not call Gemini (see the audit's own "remaining
// limitation" note -- Gemini's per-generation variance is not something a
// deterministic test can characterize).
import assert from "node:assert/strict";
import sharp from "sharp";
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import { SharpMockupRenderer } from "../engines/sharp-renderer";
import { loadTemplateBuffer } from "../templates";
import { getEffectiveScaleBounds, resolvePlacement } from "../transform";
import { runSuite } from "./test-harness";

const MARKER = { r: 255, g: 0, b: 255 }; // magenta -- cannot occur in a real garment/skin/backdrop photo
const MARKER_MATCH_TOLERANCE = 40; // per-channel; resize interpolation softens a few edge pixels

async function markerArtwork(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { ...MARKER, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

async function detectMarkerBBox(
  buffer: Buffer,
): Promise<{ left: number; top: number; width: number; height: number } | null> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const dr = Math.abs(data[idx] - MARKER.r);
      const dg = Math.abs(data[idx + 1] - MARKER.g);
      const db = Math.abs(data[idx + 2] - MARKER.b);
      if (dr <= MARKER_MATCH_TOLERANCE && dg <= MARKER_MATCH_TOLERANCE && db <= MARKER_MATCH_TOLERANCE) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

type Case = {
  product: ProductType;
  color: GarmentColor;
  placement: PlacementType;
  artworkShape: "square" | "portrait" | "landscape";
  artworkWidth: number;
  artworkHeight: number;
  scale: number;
};

const CASES: Case[] = [
  // FRONT, FITTED/WHITE (real template: TGFM White.png, 1254x1254 square)
  { product: "FITTED", color: "WHITE", placement: "CENTER_FRONT", artworkShape: "square", artworkWidth: 200, artworkHeight: 200, scale: 1 },
  { product: "FITTED", color: "WHITE", placement: "CENTER_FRONT", artworkShape: "portrait", artworkWidth: 150, artworkHeight: 300, scale: 1 },
  { product: "FITTED", color: "WHITE", placement: "CENTER_FRONT", artworkShape: "landscape", artworkWidth: 300, artworkHeight: 150, scale: 1 },
  { product: "FITTED", color: "WHITE", placement: "FULL_FRONT", artworkShape: "square", artworkWidth: 200, artworkHeight: 200, scale: 1 },
  { product: "FITTED", color: "WHITE", placement: "FULL_FRONT", artworkShape: "portrait", artworkWidth: 150, artworkHeight: 300, scale: 1.3 },

  // BACK, FITTED/WHITE (real template: TGFM White Back.png, 1024x1536 portrait -- NOT square)
  { product: "FITTED", color: "WHITE", placement: "CENTER_BACK", artworkShape: "square", artworkWidth: 200, artworkHeight: 200, scale: 1 },
  { product: "FITTED", color: "WHITE", placement: "CENTER_BACK", artworkShape: "portrait", artworkWidth: 150, artworkHeight: 300, scale: 1 },
  { product: "FITTED", color: "WHITE", placement: "CENTER_BACK", artworkShape: "landscape", artworkWidth: 300, artworkHeight: 150, scale: 1 },
  { product: "FITTED", color: "WHITE", placement: "FULL_BACK", artworkShape: "square", artworkWidth: 200, artworkHeight: 200, scale: 1 },
  { product: "FITTED", color: "WHITE", placement: "FULL_BACK", artworkShape: "portrait", artworkWidth: 150, artworkHeight: 300, scale: 1.3 },

  // Cross-product sanity: OVERSIZED/BLACK, both sides, one shape each.
  { product: "OVERSIZED", color: "BLACK", placement: "CENTER_FRONT", artworkShape: "square", artworkWidth: 220, artworkHeight: 220, scale: 1 },
  { product: "OVERSIZED", color: "BLACK", placement: "CENTER_BACK", artworkShape: "square", artworkWidth: 220, artworkHeight: 220, scale: 1 },
];

function caseName(c: Case): string {
  return `${c.product}/${c.color}/${c.placement} ${c.artworkShape} artwork scale=${c.scale} -- real template, requested==resolved==actual within tolerance`;
}

export async function runAll() {
  const renderer = new SharpMockupRenderer();
  const tests: Record<string, () => Promise<void>> = {};

  for (const c of CASES) {
    tests[caseName(c)] = async () => {
      const template = await loadTemplateBuffer(c.product, c.color, c.placement.includes("BACK") ? "back" : "front");
      const templateMeta = await sharp(template).metadata();
      const templateWidth = templateMeta.width!;
      const templateHeight = templateMeta.height!;

      const artwork = await markerArtwork(c.artworkWidth, c.artworkHeight);
      const transform = { x: 0, y: 0, scale: c.scale };

      // "Requested" and "resolved" collapse to the same computation for the
      // deterministic Print Mockup path (no Gemini garment-bbox remap step
      // here) -- this is resolvePlacement's own ground truth, independent
      // of the renderer.
      const resolved = resolvePlacement({
        product: c.product,
        color: c.color,
        placement: c.placement,
        transform,
        templateWidth,
        templateHeight,
        artworkWidth: c.artworkWidth,
        artworkHeight: c.artworkHeight,
      });

      // No unexpected scale reduction: the case's requested scale must
      // survive resolvePlacement's own per-placement clamp unchanged
      // (every case here was chosen to sit within bounds).
      const bounds = getEffectiveScaleBounds(c.product, c.color, c.placement);
      assert.ok(
        c.scale >= bounds.min && c.scale <= bounds.max,
        `test case scale ${c.scale} is outside this placement's own effective bounds [${bounds.min}, ${bounds.max}] -- fix the test case, not the assertion`,
      );

      const rendered = await renderer.render({
        artwork,
        template,
        product: c.product,
        color: c.color,
        placement: c.placement,
        transform,
        dpi: 150, // BASELINE_RENDER_DPI -- 1:1 with the template's own pixels, no dpi rescale to account for
      });

      const actual = await detectMarkerBBox(rendered.data);
      assert.ok(actual, `expected to detect the marker-coloured artwork in the rendered output for ${caseName(c)}`);

      // Tolerance: at least 3px, or 1% of the template's own width --
      // covers resize/rotate interpolation softening a few edge pixels,
      // not a real geometry drift.
      const tolerance = Math.max(3, Math.round(templateWidth * 0.01));

      assert.ok(
        Math.abs(actual!.left - resolved.left) <= tolerance,
        `left mismatch for ${caseName(c)}: resolved=${resolved.left}, actual=${actual!.left}, tolerance=${tolerance}`,
      );
      assert.ok(
        Math.abs(actual!.top - resolved.top) <= tolerance,
        `top mismatch for ${caseName(c)}: resolved=${resolved.top}, actual=${actual!.top}, tolerance=${tolerance}`,
      );
      assert.ok(
        Math.abs(actual!.width - resolved.width) <= tolerance,
        `width mismatch for ${caseName(c)}: resolved=${resolved.width}, actual=${actual!.width}, tolerance=${tolerance}`,
      );
      assert.ok(
        Math.abs(actual!.height - resolved.height) <= tolerance,
        `height mismatch for ${caseName(c)}: resolved=${resolved.height}, actual=${actual!.height}, tolerance=${tolerance}`,
      );

      // No clipping/overflow: the actual detected bbox must stay fully
      // within the template canvas.
      assert.ok(actual!.left >= 0 && actual!.top >= 0, `artwork clipped off the top/left edge for ${caseName(c)}`);
      assert.ok(
        actual!.left + actual!.width <= templateWidth && actual!.top + actual!.height <= templateHeight,
        `artwork overflowed the template canvas for ${caseName(c)}`,
      );

      // Aspect ratio preserved: the detected bbox's own ratio must match
      // the artwork's original ratio within a small relative tolerance
      // (rounding on both the resolve and the marker-detection side).
      const expectedRatio = c.artworkWidth / c.artworkHeight;
      const actualRatio = actual!.width / actual!.height;
      assert.ok(
        Math.abs(actualRatio - expectedRatio) / expectedRatio < 0.05,
        `aspect ratio not preserved for ${caseName(c)}: expected ~${expectedRatio.toFixed(3)}, got ${actualRatio.toFixed(3)}`,
      );
    };
  }

  return runSuite("real-template-front-back", tests);
}
