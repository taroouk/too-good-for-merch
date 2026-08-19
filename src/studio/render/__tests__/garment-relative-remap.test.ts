// file: src/studio/render/__tests__/garment-relative-remap.test.ts
//
// Covers remapResolvedPlacementToGarmentBBox() -- the garment-relative
// replacement for remapResolvedPlacement(), which repeated real-generation
// testing (scripts/investigate-geometry.mjs) proved unreliable: Gemini can
// return the exact same output canvas size while framing/cropping/zooming
// the garment completely differently within it, something a full-canvas
// remap has no way to detect or correct for.
import assert from "node:assert/strict";
import { remapResolvedPlacementToGarmentBBox } from "../transform";
import type { GarmentBBox, ResolvedPlacement } from "../types";
import { runSuite } from "./test-harness";

export async function runAll() {
  return runSuite("garment-relative-remap", {
    "identity mapping: identical garment bbox in both images leaves the artwork box unchanged"() {
      const garmentBBox: GarmentBBox = { left: 300, top: 50, width: 600, height: 1150 };
      const resolved: ResolvedPlacement = { left: 460, top: 570, width: 320, height: 320, rotation: 0 };
      const remapped = remapResolvedPlacementToGarmentBBox(resolved, garmentBBox, garmentBBox);
      assert.deepEqual(remapped, resolved);
    },

    "different garment bboxes: artwork stays at the same FRACTIONAL position/size relative to the garment, not the canvas"() {
      // Template: garment occupies [300..900) horizontally, [50..1200) vertically.
      const templateGarmentBBox: GarmentBBox = { left: 300, top: 50, width: 600, height: 1150 };
      // Gemini output: same 1254x1254-ish canvas scale, but the garment has
      // shifted right and shrunk -- e.g. a wider crop around a full model.
      const geminiGarmentBBox: GarmentBBox = { left: 500, top: 100, width: 300, height: 900 };

      // Artwork centered horizontally on the garment, in its lower-middle third.
      const resolved: ResolvedPlacement = {
        left: templateGarmentBBox.left + templateGarmentBBox.width * 0.25,
        top: templateGarmentBBox.top + templateGarmentBBox.height * 0.5,
        width: templateGarmentBBox.width * 0.5,
        height: templateGarmentBBox.width * 0.5, // square artwork
        rotation: 0,
      };

      const remapped = remapResolvedPlacementToGarmentBBox(resolved, templateGarmentBBox, geminiGarmentBBox);

      const leftFrac = (remapped.left - geminiGarmentBBox.left) / geminiGarmentBBox.width;
      const topFrac = (remapped.top - geminiGarmentBBox.top) / geminiGarmentBBox.height;
      const widthFrac = remapped.width / geminiGarmentBBox.width;

      assert.ok(Math.abs(leftFrac - 0.25) < 0.01, `expected leftFrac ~0.25, got ${leftFrac}`);
      assert.ok(Math.abs(topFrac - 0.5) < 0.01, `expected topFrac ~0.5, got ${topFrac}`);
      assert.ok(Math.abs(widthFrac - 0.5) < 0.01, `expected widthFrac ~0.5, got ${widthFrac}`);
    },

    "scale changes: a garment that occupies MORE of the target frame scales the artwork up to match (the real observed bug)"() {
      // Reproduces the actual numbers from the OVERSIZED/BLACK investigation:
      // template garment ~50% of a 1254-wide canvas; one real Gemini run's
      // garment ballooned to ~74% of a 1024-wide canvas (tight fabric-only
      // crop, no model) while another run's stayed ~52% (full model shot).
      const templateGarmentBBox: GarmentBBox = { left: 309, top: 24, width: 634, height: 1205 };
      const resolved: ResolvedPlacement = { left: 464, top: 577, width: 326, height: 326, rotation: 0 };

      const tightCropGarmentBBox: GarmentBBox = { left: 133, top: 79, width: 757, height: 861 };
      const fullModelGarmentBBox: GarmentBBox = { left: 234, top: 17, width: 536, height: 1007 };

      const remappedTight = remapResolvedPlacementToGarmentBBox(resolved, templateGarmentBBox, tightCropGarmentBBox);
      const remappedFullModel = remapResolvedPlacementToGarmentBBox(resolved, templateGarmentBBox, fullModelGarmentBBox);

      // The artwork must be measurably WIDER in pixel terms against the
      // tight-crop garment bbox (757px wide) than the full-model one (536px
      // wide), since it occupies the same ~51% of the garment's width in
      // both -- this is the fix: size follows the garment, not the canvas.
      assert.ok(
        remappedTight.width > remappedFullModel.width,
        `expected tight-crop artwork (${remappedTight.width}px) to be wider than full-model artwork (${remappedFullModel.width}px)`,
      );

      // And critically, relative to EACH garment, the artwork occupies the
      // same fraction of width in both -- the whole point of this remap.
      // Tolerance accounts for Math.round()'ing to whole pixels at these
      // box sizes, not a real divergence.
      const fracTight = remappedTight.width / tightCropGarmentBBox.width;
      const fracFullModel = remappedFullModel.width / fullModelGarmentBBox.width;
      assert.ok(
        Math.abs(fracTight - fracFullModel) < 0.005,
        `expected garment-relative width fraction to match across framings, got ${fracTight} vs ${fracFullModel}`,
      );
    },

    "edge clipping: an artwork box that extends past the garment bbox edge remaps without being clamped"() {
      const templateGarmentBBox: GarmentBBox = { left: 300, top: 50, width: 600, height: 1150 };
      // Artwork placed so its right edge overhangs the garment's right edge
      // by 10% of the garment's width -- a legitimate, if aggressive, user
      // placement (large scale near an edge).
      const resolved: ResolvedPlacement = {
        left: templateGarmentBBox.left + templateGarmentBBox.width * 0.8,
        top: templateGarmentBBox.top + templateGarmentBBox.height * 0.1,
        width: templateGarmentBBox.width * 0.3,
        height: templateGarmentBBox.width * 0.3,
        rotation: 0,
      };
      const geminiGarmentBBox: GarmentBBox = { left: 100, top: 100, width: 800, height: 800 };

      const remapped = remapResolvedPlacementToGarmentBBox(resolved, templateGarmentBBox, geminiGarmentBBox);

      // The overhang must be preserved proportionally, not clamped to the
      // garment's own right edge -- compositeArtworkOntoBase (unchanged)
      // is what actually clips pixels at composite time.
      const rightEdgeFrac = (remapped.left + remapped.width - geminiGarmentBBox.left) / geminiGarmentBBox.width;
      assert.ok(rightEdgeFrac > 1, `expected the artwork to still overhang the garment's right edge, got rightEdgeFrac=${rightEdgeFrac}`);
      assert.ok(Math.abs(rightEdgeFrac - 1.1) < 0.01, `expected ~10% overhang preserved, got ${rightEdgeFrac}`);
    },

    "non-square output: garment bboxes with different aspect ratios never distort the artwork"() {
      const templateGarmentBBox: GarmentBBox = { left: 300, top: 50, width: 600, height: 1150 }; // tall
      const geminiGarmentBBox: GarmentBBox = { left: 50, top: 300, width: 900, height: 400 }; // wide, short
      const resolved: ResolvedPlacement = { left: 460, top: 570, width: 320, height: 160, rotation: 0 }; // 2:1 artwork
      const originalAspect = resolved.height / resolved.width;

      const remapped = remapResolvedPlacementToGarmentBBox(resolved, templateGarmentBBox, geminiGarmentBBox);
      const remappedAspect = remapped.height / remapped.width;

      assert.ok(
        Math.abs(remappedAspect - originalAspect) < 0.01,
        `expected aspect ratio to stay ~${originalAspect}, got ${remappedAspect}`,
      );
    },

    "rotation carried through unchanged"() {
      const templateGarmentBBox: GarmentBBox = { left: 300, top: 50, width: 600, height: 1150 };
      const geminiGarmentBBox: GarmentBBox = { left: 100, top: 100, width: 400, height: 900 };
      const resolved: ResolvedPlacement = { left: 400, top: 400, width: 100, height: 100, rotation: 33.5 };

      const remapped = remapResolvedPlacementToGarmentBBox(resolved, templateGarmentBBox, geminiGarmentBBox);
      assert.equal(remapped.rotation, 33.5);
    },
  });
}
