// file: src/studio/render/__tests__/fabric-shading.test.ts
//
// fabric-shading.ts is the only part of the render pipeline that changes
// the artwork's own pixels, so it is also the only part that could quietly
// ship the customer a different design than the one they approved. The
// properties below are the guardrails that make it safe to have on by
// default:
//
//   - it is provably a NO-OP when switched off, and on flat fabric;
//   - it is bounded, so no garment pixel can crush or blow out the print;
//   - it never touches the print's SHAPE (alpha carries geometry);
//   - it is deterministic, which the Print Mockup's fingerprint cache
//     depends on.
//
// Plus the reason it exists at all: dark fabric and light fabric must both
// actually modulate the print, and a fold has to reach dark ink (which a
// purely multiplicative model cannot do -- see highlightLiftLevels).
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  DEFAULT_FABRIC_SHADING,
  applyFabricShading,
  canSampleShadingRegion,
  highlightLiftLevels,
  shadingMultiplier,
  type FabricShadingOptions,
} from "../fabric-shading";
import { runSuite } from "./test-harness";

const OFF: FabricShadingOptions = { ...DEFAULT_FABRIC_SHADING, strength: 0 };

async function solid(width: number, height: number, rgb: [number, number, number], alpha = 1) {
  return sharp({
    create: { width, height, channels: 4, background: { r: rgb[0], g: rgb[1], b: rgb[2], alpha } },
  })
    .png()
    .toBuffer();
}

// A garment crop with a real light-to-dark ramp across it -- stands in for
// the fabric rolling into a fold.
async function gradient(width: number, height: number, from: number, to: number) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = Math.round(from + ((to - from) * x) / Math.max(1, width - 1));
      const i = (y * width + x) * 3;
      raw[i] = value;
      raw[i + 1] = value;
      raw[i + 2] = value;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function pixelAt(image: Buffer, x: number, y: number) {
  const { data } = await sharp(image)
    .ensureAlpha()
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2], a: data[3] };
}

export async function runAll() {
  return runSuite("fabric-shading", {
    "strength 0 is exactly the identity, for every possible luminance"() {
      for (let luminance = 0; luminance < 256; luminance++) {
        assert.equal(shadingMultiplier(luminance, 128, 20, OFF), 1);
        assert.equal(highlightLiftLevels(luminance, 128, 20, OFF), 0);
      }
    },

    "fabric darker than its surroundings darkens the print; brighter brightens it"() {
      const shadow = shadingMultiplier(100, 140, 20, DEFAULT_FABRIC_SHADING);
      const neutral = shadingMultiplier(140, 140, 20, DEFAULT_FABRIC_SHADING);
      const highlight = shadingMultiplier(180, 140, 20, DEFAULT_FABRIC_SHADING);
      assert.ok(shadow < 1, `expected a fold to darken the print, got ${shadow}`);
      assert.equal(neutral, 1);
      assert.ok(highlight > 1, `expected a highlight to brighten the print, got ${highlight}`);
    },

    "the multiplier can never leave its configured bounds, whatever the garment pixel"() {
      for (const stdDev of [0, 1, 5, 40, 120]) {
        for (let luminance = 0; luminance < 256; luminance++) {
          const m = shadingMultiplier(luminance, 128, stdDev, DEFAULT_FABRIC_SHADING);
          assert.ok(
            m >= DEFAULT_FABRIC_SHADING.minMultiplier && m <= DEFAULT_FABRIC_SHADING.maxMultiplier,
            `multiplier ${m} escaped its bounds at luminance=${luminance}, stdDev=${stdDev}`,
          );
        }
      }
    },

    "modulation saturates instead of growing without limit at extreme contrast"() {
      const atClamp = shadingMultiplier(128 + 2.5 * 10, 128, 10, DEFAULT_FABRIC_SHADING);
      const wayPast = shadingMultiplier(255, 128, 10, DEFAULT_FABRIC_SHADING);
      assert.ok(Math.abs(atClamp - wayPast) < 1e-9, "beyond the contrast clamp the effect must plateau");
    },

    "it adapts to the photo: the same fold reads the same on low- and high-contrast fabric"() {
      // A fold one standard deviation deep should cost the print the same
      // amount of light whether the garment photo is punchy or flat. This
      // is the property a fixed gain does NOT have, and the reason these
      // evenly-lit studio shots looked unconvincing before.
      const flatFabric = shadingMultiplier(120 - 12, 120, 12, DEFAULT_FABRIC_SHADING);
      const punchyFabric = shadingMultiplier(120 - 40, 120, 40, DEFAULT_FABRIC_SHADING);
      assert.ok(
        Math.abs(flatFabric - punchyFabric) < 1e-9,
        `expected the same modulation per standard deviation, got ${flatFabric} vs ${punchyFabric}`,
      );
    },

    "the standard-deviation floor stops a flat region from normalizing its own noise to full scale"() {
      // Without a floor, adaptive normalization is degenerate on flat
      // fabric: a standard deviation of 0.5 would make a 2-level wobble
      // 4 standard deviations from the mean, i.e. past the contrast clamp,
      // so pure sensor noise would be rendered at the SAME strength as a
      // real deep fold. The floor is what prevents that.
      const withFloor = shadingMultiplier(128 + 2, 128, 0.5, DEFAULT_FABRIC_SHADING);
      const fullScale = shadingMultiplier(128 + 2, 128, 0.5, {
        ...DEFAULT_FABRIC_SHADING,
        minStdDev: 0,
      });
      const deepFold = shadingMultiplier(128 + 40, 128, 16, DEFAULT_FABRIC_SHADING);

      assert.ok(
        Math.abs(fullScale - 1) > Math.abs(withFloor - 1) * 3,
        "without the floor, noise would be normalized far higher -- the floor is not doing anything",
      );
      assert.ok(
        Math.abs(fullScale - 1) >= Math.abs(deepFold - 1) - 1e-9,
        "sanity: unfloored noise really would saturate like a deep fold",
      );
      assert.ok(
        Math.abs(withFloor - 1) < Math.abs(deepFold - 1) / 3,
        `floored noise (${withFloor}) must stay well below a real fold (${deepFold})`,
      );
    },

    "highlight lift is additive, one-sided and small"() {
      assert.equal(highlightLiftLevels(100, 140, 20, DEFAULT_FABRIC_SHADING), 0, "shadow must not lift");
      assert.equal(highlightLiftLevels(140, 140, 20, DEFAULT_FABRIC_SHADING), 0, "the mean must not lift");
      const lift = highlightLiftLevels(255, 140, 20, DEFAULT_FABRIC_SHADING);
      assert.ok(lift > 0, "a highlight must lift");
      assert.ok(lift <= 255 * DEFAULT_FABRIC_SHADING.highlightLift, `lift ${lift} exceeded its ceiling`);
      assert.ok(lift < 16, `lift ${lift} is a sheen, not a light source`);
    },

    async "flat fabric leaves the print's colour alone (ink absorption aside)"() {
      const artwork = await solid(40, 20, [255, 0, 0]);
      const garment = await solid(40, 20, [250, 250, 250]);
      const out = await applyFabricShading(artwork, garment);
      const px = await pixelAt(out, 20, 10);
      assert.equal(px.r, 255);
      assert.equal(px.g, 0);
      assert.equal(px.b, 0);
    },

    async "a fold reaches DARK ink too -- the case a multiply-only model cannot serve"() {
      // Near-black artwork over fabric that ramps from shadow to
      // highlight. Multiplying black by anything is still black, so if the
      // lit end is not measurably brighter than the shadowed end, the
      // print is sitting on the garment instead of lying along it.
      const artwork = await solid(120, 20, [18, 18, 18]);
      const garment = await gradient(120, 20, 40, 210);
      const out = await applyFabricShading(artwork, garment);
      const shadowSide = await pixelAt(out, 4, 10);
      const litSide = await pixelAt(out, 115, 10);
      assert.ok(
        litSide.r > shadowSide.r + 4,
        `dark ink did not follow the fold: shadow ${shadowSide.r} vs lit ${litSide.r}`,
      );
    },

    async "a fold reaches LIGHT ink, in the same direction"() {
      const artwork = await solid(120, 20, [245, 245, 245]);
      const garment = await gradient(120, 20, 40, 210);
      const out = await applyFabricShading(artwork, garment);
      const shadowSide = await pixelAt(out, 4, 10);
      const litSide = await pixelAt(out, 115, 10);
      assert.ok(
        litSide.r > shadowSide.r + 8,
        `light ink did not follow the fold: shadow ${shadowSide.r} vs lit ${litSide.r}`,
      );
    },

    async "the print's SHAPE is never reshaded away: transparent stays transparent"() {
      const artwork = await solid(40, 20, [255, 0, 0], 0);
      const garment = await gradient(40, 20, 20, 240);
      const out = await applyFabricShading(artwork, garment);
      const px = await pixelAt(out, 20, 10);
      assert.equal(px.a, 0, "a fully transparent print pixel must stay fully transparent");
    },

    async "output keeps the artwork's exact dimensions, so the compositor's offset stays valid"() {
      const artwork = await solid(73, 29, [10, 120, 200]);
      const garment = await gradient(73, 29, 60, 200);
      const out = await applyFabricShading(artwork, garment);
      const meta = await sharp(out).metadata();
      assert.equal(meta.width, 73);
      assert.equal(meta.height, 29);
    },

    async "is deterministic: identical input -> byte-identical output"() {
      const artwork = await solid(64, 32, [200, 40, 90]);
      const garment = await gradient(64, 32, 30, 220);
      const first = await applyFabricShading(artwork, garment);
      const second = await applyFabricShading(artwork, garment);
      assert.deepEqual(first, second);
    },

    async "a size mismatch is a hard error, not a silently misaligned shade"() {
      const artwork = await solid(40, 20, [255, 0, 0]);
      const garment = await solid(41, 20, [200, 200, 200]);
      await assert.rejects(
        () => applyFabricShading(artwork, garment),
        /same size/i,
        "shading a mismatched crop would put the garment's folds in the wrong place",
      );
    },

    async "a region with no luminance signal at all is left completely alone"() {
      const artwork = await solid(30, 30, [255, 255, 255]);
      const garment = await solid(30, 30, [0, 0, 0]);
      const out = await applyFabricShading(artwork, garment);
      assert.deepEqual(out, artwork, "a pure-black crop has nothing to transfer");
    },

    "a placement fully on the base image can be sampled"() {
      assert.equal(canSampleShadingRegion({ left: 10, top: 10, width: 50, height: 50 }, 100, 100), true);
      assert.equal(canSampleShadingRegion({ left: 0, top: 0, width: 100, height: 100 }, 100, 100), true);
    },

    "a placement hanging off any edge cannot be sampled (callers fall back to a flat composite)"() {
      assert.equal(canSampleShadingRegion({ left: -1, top: 10, width: 50, height: 50 }, 100, 100), false);
      assert.equal(canSampleShadingRegion({ left: 10, top: -1, width: 50, height: 50 }, 100, 100), false);
      assert.equal(canSampleShadingRegion({ left: 60, top: 10, width: 50, height: 50 }, 100, 100), false);
      assert.equal(canSampleShadingRegion({ left: 10, top: 60, width: 50, height: 50 }, 100, 100), false);
      assert.equal(canSampleShadingRegion({ left: 10, top: 10, width: 0, height: 50 }, 100, 100), false);
    },
  });
}
