// file: src/studio/render/__tests__/remap-and-composite.test.ts
//
// Covers the two new primitives the AI Mockup post-compositor depends on:
// remapResolvedPlacement() (mapping resolved geometry from the template's
// pixel space onto Gemini's actual, possibly-different output dimensions
// without distorting the artwork) and compositeArtworkOntoBase() (the
// shared compositing mechanics extracted from sharp-renderer.ts, now used
// against an arbitrary base image, not just the template).
import assert from "node:assert/strict";
import sharp from "sharp";
import { remapResolvedPlacement } from "../transform";
import { compositeArtworkOntoBase } from "../composite";
import type { ResolvedPlacement } from "../types";
import { runSuite } from "./test-harness";

async function solidPng(width: number, height: number, color: { r: number; g: number; b: number; alpha?: number }) {
  return sharp({
    create: { width, height, channels: 4, background: { r: color.r, g: color.g, b: color.b, alpha: color.alpha ?? 1 } },
  })
    .png()
    .toBuffer();
}

export async function runAll() {
  return runSuite("remap-and-composite", {
    "remapResolvedPlacement is an identity map when dimensions are unchanged"() {
      const resolved: ResolvedPlacement = { left: 410, top: 500, width: 180, height: 90, rotation: 0 };
      const remapped = remapResolvedPlacement(resolved, 1000, 1000, 1000, 1000);
      assert.deepEqual(remapped, resolved);
    },

    "remapResolvedPlacement scales position and size proportionally for a uniform resize"() {
      // 1254 -> 1024 is the exact ratio observed from real Gemini output
      // during E2E testing (a 1254x1254 template came back as 1024x1024).
      const resolved: ResolvedPlacement = { left: 483, top: 577, width: 288, height: 144, rotation: 0 };
      const remapped = remapResolvedPlacement(resolved, 1254, 1254, 1024, 1024);
      const scale = 1024 / 1254;
      assert.equal(remapped.left, Math.round(483 * scale));
      assert.equal(remapped.top, Math.round(577 * scale));
      assert.equal(remapped.width, Math.round(288 * scale));
      // height re-derived from the artwork's own aspect ratio (144/288 =
      // 0.5), not independently scaled -- must land on the same value here
      // since the resize is uniform, but derived via a different path.
      assert.equal(remapped.height, Math.round(remapped.width * (144 / 288)));
    },

    "remapResolvedPlacement never distorts the artwork's aspect ratio, even for a non-uniform (non-square) target canvas"() {
      const resolved: ResolvedPlacement = { left: 400, top: 400, width: 200, height: 100, rotation: 0 };
      const originalAspect = resolved.height / resolved.width; // 0.5
      // Target canvas has a DIFFERENT aspect ratio than the 1000x1000
      // source (800 wide x 1200 tall) -- simulates Gemini returning a
      // portrait-cropped image instead of preserving the template's square
      // framing.
      const remapped = remapResolvedPlacement(resolved, 1000, 1000, 800, 1200);
      const remappedAspect = remapped.height / remapped.width;
      assert.ok(
        Math.abs(remappedAspect - originalAspect) < 0.01,
        `expected aspect ratio to stay ~${originalAspect}, got ${remappedAspect}`,
      );
    },

    "remapResolvedPlacement carries rotation through unchanged"() {
      const resolved: ResolvedPlacement = { left: 100, top: 100, width: 50, height: 50, rotation: 27.5 };
      const remapped = remapResolvedPlacement(resolved, 500, 500, 300, 300);
      assert.equal(remapped.rotation, 27.5);
    },

    async "compositeArtworkOntoBase places artwork at the exact resolved region of an ARBITRARY base image (not just a template)"() {
      // The base here stands in for Gemini's returned garment photo --
      // deliberately a different size than any "template" to prove this
      // function has no hidden dependency on template dimensions.
      const base = await solidPng(900, 700, { r: 250, g: 250, b: 250 });
      const artwork = await solidPng(120, 60, { r: 10, g: 200, b: 10 });
      const resolved: ResolvedPlacement = { left: 300, top: 250, width: 120, height: 60, rotation: 0 };

      // Shading off: this test is about GEOMETRY -- where the artwork
      // lands -- so it asserts exact pixels, which means the fabric
      // realism pass (fabric-shading.ts, on by default) must not be in the
      // way. Its own behaviour is covered in fabric-shading.test.ts, and
      // the test below proves it does not move anything.
      const result = await compositeArtworkOntoBase(base, artwork, resolved, null);
      const meta = await sharp(result).metadata();
      // Output dimensions match the BASE image, not the artwork or any
      // template -- critical since Gemini's output size varies.
      assert.equal(meta.width, 900);
      assert.equal(meta.height, 700);

      const { data: inside } = await sharp(result)
        .extract({ left: 300 + 60, top: 250 + 30, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(inside[0], 10);
      assert.equal(inside[1], 200);
      assert.equal(inside[2], 10);

      const { data: outside } = await sharp(result)
        .extract({ left: 10, top: 10, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(outside[0], 250);
      assert.equal(outside[1], 250);
      assert.equal(outside[2], 250);
    },

    async "the fabric realism pass changes how the print LOOKS, never where it lands"() {
      // The one thing shading must never do is move the artwork: the
      // customer approves a position, and the print file is cut from the
      // same geometry. Same request, shaded and unshaded -- the edges of
      // the placed artwork must fall on exactly the same pixels.
      const base = await solidPng(900, 700, { r: 250, g: 250, b: 250 });
      const artwork = await solidPng(120, 60, { r: 10, g: 200, b: 10 });
      const resolved: ResolvedPlacement = { left: 300, top: 250, width: 120, height: 60, rotation: 0 };

      const shaded = await compositeArtworkOntoBase(base, artwork, resolved);
      const flat = await compositeArtworkOntoBase(base, artwork, resolved, null);

      const shadedMeta = await sharp(shaded).metadata();
      const flatMeta = await sharp(flat).metadata();
      assert.equal(shadedMeta.width, flatMeta.width);
      assert.equal(shadedMeta.height, flatMeta.height);

      // Two pixels just INSIDE opposite corners of the placement box must
      // be artwork in both renders, and two just OUTSIDE must be garment
      // in both -- i.e. the box did not shift, grow or shrink.
      const probe = async (image: Buffer, left: number, top: number) => {
        const { data } = await sharp(image)
          .extract({ left, top, width: 1, height: 1 })
          .raw()
          .toBuffer({ resolveWithObject: true });
        return [data[0], data[1], data[2]] as const;
      };
      const isArtwork = (rgb: readonly [number, number, number]) => rgb[1] > rgb[0] + 50 && rgb[1] > rgb[2] + 50;
      const isGarment = (rgb: readonly [number, number, number]) => rgb[0] > 200 && rgb[1] > 200 && rgb[2] > 200;

      for (const [x, y] of [[302, 252], [417, 307]] as const) {
        assert.ok(isArtwork(await probe(shaded, x, y)), `shaded render is missing artwork at ${x},${y}`);
        assert.ok(isArtwork(await probe(flat, x, y)), `flat render is missing artwork at ${x},${y}`);
      }
      for (const [x, y] of [[296, 246], [424, 312]] as const) {
        assert.ok(isGarment(await probe(shaded, x, y)), `shaded render leaked artwork at ${x},${y}`);
        assert.ok(isGarment(await probe(flat, x, y)), `flat render leaked artwork at ${x},${y}`);
      }
    },

    async "compositeArtworkOntoBase is deterministic: identical input -> byte-identical output"() {
      const base = await solidPng(400, 400, { r: 200, g: 200, b: 200 });
      const artwork = await solidPng(50, 50, { r: 255, g: 0, b: 0 });
      const resolved: ResolvedPlacement = { left: 100, top: 100, width: 50, height: 50, rotation: 15 };

      const first = await compositeArtworkOntoBase(base, artwork, resolved);
      const second = await compositeArtworkOntoBase(base, artwork, resolved);
      assert.deepEqual(first, second);
    },
  });
}
