// file: src/studio/render/__tests__/template-resolution-parity.test.ts
//
// Regression coverage for P3-21k: TGFM Black.png (FITTED/BLACK/front) is a
// 2480x2480 re-export of the identical framing as TGFM White.png's
// 1254x1254 -- same aspect ratio, double the resolution. Before the fix,
// SharpMockupRenderer sized its output off each template's own raw
// metadata, so an otherwise-identical mockup request produced a ~2x larger
// output raster for BLACK than for WHITE. These tests render against the
// REAL template files (not synthetic canvases) so they'd have caught the
// actual asset-size discrepancy, not just a mocked one.
import assert from "node:assert/strict";
import sharp from "sharp";
import { SharpMockupRenderer } from "../engines/sharp-renderer";
import { loadTemplateBuffer } from "../templates";
import { BASELINE_RENDER_DPI } from "../transform";
import type { RenderRequest } from "../types";
import { runSuite } from "./test-harness";

async function markerArtwork(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 100, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

async function requestFor(color: "BLACK" | "WHITE", overrides: Partial<RenderRequest> = {}): Promise<RenderRequest> {
  const template = await loadTemplateBuffer("FITTED", color, "front");
  return {
    artwork: await markerArtwork(),
    template,
    product: "FITTED",
    color,
    placement: "CENTER_FRONT",
    transform: { x: 0, y: 0, scale: 1 },
    dpi: BASELINE_RENDER_DPI,
    ...overrides,
  };
}

export async function runAll() {
  const renderer = new SharpMockupRenderer();

  return runSuite("template-resolution-parity", {
    async "sanity check: the real BLACK and WHITE FITTED front template files are NOT the same native size"() {
      const black = await sharp(await loadTemplateBuffer("FITTED", "BLACK", "front")).metadata();
      const white = await sharp(await loadTemplateBuffer("FITTED", "WHITE", "front")).metadata();
      // This is the root cause the fix works around, not something the fix
      // changes -- the source assets themselves differ in native
      // resolution. If this ever stops being true (e.g. the assets get
      // re-exported to match), the parity assertions below should still
      // hold trivially.
      assert.notEqual(black.width, white.width);
    },

    // NOTE: the template assets were replaced (2026-09-18) with a new
    // generation of photos where BLACK and WHITE are genuinely different
    // crops/framings, not just different resolutions of the same framing --
    // unlike the previous generation, their aspect ratios now differ too
    // (e.g. FITTED front: BLACK ~0.475, WHITE ~0.490). Reference-width
    // normalization (see TEMPLATE_REFERENCE_WIDTH's own comment) only
    // guarantees the same output WIDTH across colors -- height is re-derived
    // from each template's own actual aspect ratio, so it no longer matches
    // between colors when their native aspect ratios themselves differ.
    // These tests were updated to assert what the normalization actually
    // guarantees (equal width, and each result preserving its OWN source
    // template's aspect ratio) rather than exact (width, height) equality.
    async "identical FITTED/CENTER_FRONT requests produce the SAME output WIDTH for BLACK and WHITE"() {
      const blackResult = await renderer.render(await requestFor("BLACK"));
      const whiteResult = await renderer.render(await requestFor("WHITE"));
      assert.equal(blackResult.width, whiteResult.width);
    },

    async "output width parity holds across placements sharing the front side"() {
      const blackResult = await renderer.render(await requestFor("BLACK", { placement: "LEFT_CHEST" }));
      const whiteResult = await renderer.render(await requestFor("WHITE", { placement: "LEFT_CHEST" }));
      assert.equal(blackResult.width, whiteResult.width);
    },

    async "output width parity holds under a doubled DPI request too"() {
      const blackResult = await renderer.render(await requestFor("BLACK", { dpi: BASELINE_RENDER_DPI * 2 }));
      const whiteResult = await renderer.render(await requestFor("WHITE", { dpi: BASELINE_RENDER_DPI * 2 }));
      assert.equal(blackResult.width, whiteResult.width);
    },

    async "each color's output preserves its OWN source template's aspect ratio (normalization never distorts it)"() {
      const blackResult = await renderer.render(await requestFor("BLACK"));
      const whiteResult = await renderer.render(await requestFor("WHITE"));
      const blackTemplateMeta = await sharp(await loadTemplateBuffer("FITTED", "BLACK", "front")).metadata();
      const whiteTemplateMeta = await sharp(await loadTemplateBuffer("FITTED", "WHITE", "front")).metadata();
      const blackExpectedRatio = blackTemplateMeta.width! / blackTemplateMeta.height!;
      const whiteExpectedRatio = whiteTemplateMeta.width! / whiteTemplateMeta.height!;
      assert.ok(Math.abs(blackResult.width / blackResult.height - blackExpectedRatio) < 0.01);
      assert.ok(Math.abs(whiteResult.width / whiteResult.height - whiteExpectedRatio) < 0.01);
    },

    async "BACK templates: output width parity holds, and each color preserves its own aspect ratio"() {
      const blackTemplate = await loadTemplateBuffer("FITTED", "BLACK", "back");
      const whiteTemplate = await loadTemplateBuffer("FITTED", "WHITE", "back");
      const blackBack = await renderer.render({
        artwork: await markerArtwork(),
        template: blackTemplate,
        product: "FITTED",
        color: "BLACK",
        placement: "CENTER_BACK",
        transform: { x: 0, y: 0, scale: 1 },
        dpi: BASELINE_RENDER_DPI,
      });
      const whiteBack = await renderer.render({
        artwork: await markerArtwork(),
        template: whiteTemplate,
        product: "FITTED",
        color: "WHITE",
        placement: "CENTER_BACK",
        transform: { x: 0, y: 0, scale: 1 },
        dpi: BASELINE_RENDER_DPI,
      });
      assert.equal(blackBack.width, whiteBack.width);
      const blackTemplateMeta = await sharp(blackTemplate).metadata();
      const whiteTemplateMeta = await sharp(whiteTemplate).metadata();
      assert.ok(
        Math.abs(blackBack.width / blackBack.height - blackTemplateMeta.width! / blackTemplateMeta.height!) < 0.01,
      );
      assert.ok(
        Math.abs(whiteBack.width / whiteBack.height - whiteTemplateMeta.width! / whiteTemplateMeta.height!) < 0.01,
      );
    },
  });
}
