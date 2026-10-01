// file: src/studio/render/fabric-shading.ts
//
// Makes a composited print look PRINTED ON the garment rather than pasted
// over a photo of one.
//
// The compositor's job (composite.ts) is pure geometry: resize the artwork
// into the resolved box, rotate it, alpha-over it onto the base. That is
// correct and deterministic, and it is also exactly what a sticker looks
// like -- a perfectly flat, perfectly lit rectangle sitting on top of a
// photograph that has folds, wrinkles, seams, a light source and a shadow
// side. The eye reads the mismatch instantly, even when it cannot name it.
//
// What this module adds, in the order the eye notices it:
//
//   1. SHADING TRANSFER (by far the biggest effect). The garment's own
//      light and shade, sampled from the pixels the print is about to
//      cover, is re-applied to the print. Where the fabric goes into a
//      fold the ink goes with it; where it catches the light the ink
//      brightens. This is the single thing that makes a flat overlay stop
//      looking flat, and it comes from the real photo -- nothing is
//      simulated, invented or randomised.
//
//   2. HIGHLIGHT LIFT. Shading transfer is multiplicative, which is right
//      for shadow but cannot do anything for DARK ink: black artwork at
//      luminance 20 is still black at 1.18x. Real cloth does not behave
//      that way -- where a fold catches the light, the specular sheen sits
//      ON TOP of whatever is printed there, so a black print visibly picks
//      up the fold. That is an additive, roughly neutral term, and it is
//      kept small (a dozen levels at most) because it is a sheen, not a
//      light source.
//
//   3. INK ABSORPTION. Real DTG ink soaks into cotton instead of sitting
//      on it as a sealed film, so a print is very slightly translucent and
//      its edges are very slightly soft (the weave breaks up a hard vector
//      edge at the fibre level). A razor-sharp 100%-opaque edge is a
//      digital-only artifact.
//
// DETERMINISM: no RNG, no synthesized noise, no generated grain -- every
// value below is derived from the base image's own pixels, so identical
// input still produces byte-identical output. That is a hard requirement:
// the Print Mockup is fingerprint-cached (see /api/mockups/print), so a
// renderer that produced even slightly different bytes for the same
// request would defeat the cache and, worse, mean the customer could
// approve one image and be shipped another.
//
// A note on the shading MODEL, which went through two wrong versions
// before this one.
//
// The obvious formulation is a RATIO: multiply the artwork by
// (pixelLuminance / regionMeanLuminance). It breaks on dark garments. On a
// black tee with a mean luminance near 30, an ordinary fold at 15 becomes
// a 0.5x multiplier and a highlight at 70 becomes 2.3x, so the print picks
// up violent contrast the garment itself does not have -- and, worse,
// drifts toward the fabric's own colour, which quietly repaints the
// customer's artwork.
//
// The next formulation is an ABSOLUTE difference from the mean times a
// fixed gain. That is stable, but it is timid in exactly the case that
// matters: these are evenly-lit studio product shots, so the real fold
// contrast on the chest is only a handful of luminance levels, and a fixed
// gain leaves the print visibly flatter than the cloth around it.
//
// What is used below normalizes each placement region by ITS OWN standard
// deviation before applying the gain. The garment photo decides how much
// contrast a fold represents; this decides how much of the print's
// modulation that fold is worth. The effect therefore reads consistently
// on a bright white tee, a black one, a crisp fold and a soft one, without
// any per-garment tuning table -- and a genuinely flat region (a standard
// deviation at or below the floor) still produces almost no modulation,
// so sensor noise never gets amplified into fake texture.
import sharp from "sharp";
import { RendererError } from "./errors";

export type FabricShadingOptions = {
  // 0 disables shading transfer entirely; 1 applies the full modulation
  // derived from the garment. Values above 1 over-drive it (and look it).
  strength: number;
  // Peak modulation, reached at `contrastClamp` standard deviations from
  // the region mean: the deepest sampled fold darkens the print to
  // (1 - amplitude)x and the brightest highlight lifts it to
  // (1 + amplitude)x.
  amplitude: number;
  // How many standard deviations from the mean count as the full range.
  // Beyond this the modulation saturates rather than growing, so a hard
  // shadow edge clipping the placement box cannot dominate the print.
  contrastClamp: number;
  // Floor on the region's standard deviation, in luminance levels. This is
  // what stops a nearly flat region from having its own sensor noise
  // normalized up into visible fake grain: below this, the division stops
  // adapting and the modulation simply stays small.
  minStdDev: number;
  // Hard floor/ceiling on the multiplier. A blown highlight or a deep
  // shadow at the very edge of the placement box must never be able to
  // crush the print to black or blow it to white.
  minMultiplier: number;
  maxMultiplier: number;
  // Specular sheen added on top of the multiplied result, as a fraction of
  // full scale, reached at the same `contrastClamp` limit. Applied only to
  // pixels BRIGHTER than the region mean -- a shadow is an absence of
  // light, already handled by the multiplier, so there is nothing to
  // subtract here.
  highlightLift: number;
  // Ink absorption: the print's overall opacity, and the radius over which
  // its own edges are softened. Both are deliberately small -- they are
  // meant to be felt, not seen.
  inkOpacity: number;
  edgeSoftenSigma: number;
};

// Tuned by rendering the real garment photos in public/images at several
// settings and comparing them side by side, not picked for roundness.
//
// The ceiling is set by where it starts to look wrong rather than by where
// it stops being visible. Past roughly amplitude 0.3 two things break on a
// WHITE garment: the red bar in the test artwork goes blotchy (the weave
// is being normalized up into mottling rather than shading), and solid
// black ink picks up a milky veil from the highlight lift. Both are worse
// than a slightly flat print, because a flat print reads as a clean
// product shot while those read as a bad composite. The values below sit
// just under that.
//
// minStdDev 5 is just above the measured noise floor of these photos'
// flattest chest areas, so flat fabric stays flat.
export const DEFAULT_FABRIC_SHADING: FabricShadingOptions = {
  strength: 1,
  amplitude: 0.26,
  contrastClamp: 2.5,
  minStdDev: 5,
  minMultiplier: 0.6,
  maxMultiplier: 1.4,
  highlightLift: 0.06,
  inkOpacity: 0.96,
  edgeSoftenSigma: 0.45,
};

// Shading transfer needs the garment pixels the print will cover. If the
// placement lands even partly off the base image there is no garment there
// to sample, and inventing one would be worse than not shading at all --
// callers fall back to a flat composite. (In practice the UI clamps drags
// to the garment's safe area, so this is a server-side-only edge case.)
export function canSampleShadingRegion(
  region: { left: number; top: number; width: number; height: number },
  baseWidth: number,
  baseHeight: number,
): boolean {
  return (
    region.width > 0 &&
    region.height > 0 &&
    region.left >= 0 &&
    region.top >= 0 &&
    region.left + region.width <= baseWidth &&
    region.top + region.height <= baseHeight
  );
}

// Exported for its own unit tests: the whole per-pixel model in one pure
// function, so the shading curve can be checked against hand-computed
// values without going near sharp or a real image.
export function shadingMultiplier(
  luminance: number,
  meanLuminance: number,
  stdDev: number,
  options: FabricShadingOptions,
): number {
  // How far this pixel sits from the region's mean, measured in the
  // region's OWN units of variation -- then saturated, so the modulation
  // is bounded no matter how extreme the sample.
  const spread = Math.max(stdDev, options.minStdDev);
  const normalized = (luminance - meanLuminance) / spread;
  const saturated = Math.min(options.contrastClamp, Math.max(-options.contrastClamp, normalized));
  const raw = 1 + (saturated / options.contrastClamp) * options.amplitude;
  const clamped = Math.min(options.maxMultiplier, Math.max(options.minMultiplier, raw));
  // Interpolate from "no modulation" (1) toward the clamped multiplier, so
  // strength scales the EFFECT rather than the luminance -- at strength 0
  // this is exactly 1 for every input, which is what makes the whole pass
  // provably a no-op when disabled.
  return 1 + (clamped - 1) * options.strength;
}

// The additive companion to shadingMultiplier: how many levels (0-255) of
// specular sheen a pixel at this luminance picks up. Zero at or below the
// region mean -- see FabricShadingOptions.highlightLift.
export function highlightLiftLevels(
  luminance: number,
  meanLuminance: number,
  stdDev: number,
  options: FabricShadingOptions,
): number {
  const spread = Math.max(stdDev, options.minStdDev);
  const normalized = (luminance - meanLuminance) / spread;
  if (normalized <= 0) return 0;
  const saturated = Math.min(options.contrastClamp, normalized);
  return (saturated / options.contrastClamp) * options.highlightLift * 255 * options.strength;
}

// `artwork` is the already-resized, already-rotated RGBA print; `garment`
// is the exact same-sized crop of the base image the print will cover.
// Returns a new RGBA PNG of identical dimensions, ready to be composited
// at the same offset the crop came from.
export async function applyFabricShading(
  artwork: Buffer,
  garment: Buffer,
  options: FabricShadingOptions = DEFAULT_FABRIC_SHADING,
): Promise<Buffer> {
  let art: { data: Buffer; info: sharp.OutputInfo };
  let lum: { data: Buffer; info: sharp.OutputInfo };
  try {
    art = await sharp(artwork).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    lum = await sharp(garment)
      // The garment crop can carry an alpha channel (the template PNGs are
      // cut out against transparency); flatten it away against mid-grey so
      // a stray transparent pixel reads as "no shading information here"
      // rather than as pure black, which would otherwise drag the region
      // mean down and darken the entire print.
      .flatten({ background: { r: 128, g: 128, b: 128 } })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new RendererError("Could not read the garment surface under the artwork.", 500);
  }

  if (art.info.width !== lum.info.width || art.info.height !== lum.info.height) {
    throw new RendererError(
      "The garment sample and the artwork must be the same size to transfer shading.",
      500,
    );
  }

  const pixels = art.info.width * art.info.height;
  if (pixels === 0) return artwork;

  const artChannels = art.info.channels;
  const lumChannels = lum.info.channels;

  let total = 0;
  for (let i = 0; i < pixels; i++) total += lum.data[i * lumChannels];
  const mean = total / pixels;

  // A region with no usable luminance signal at all (a pure-black crop)
  // has no shading to transfer, and normalizing into it would only
  // amplify sensor noise. Leave the print exactly as it was.
  if (!Number.isFinite(mean) || mean < 1) return artwork;

  let variance = 0;
  for (let i = 0; i < pixels; i++) {
    const delta = lum.data[i * lumChannels] - mean;
    variance += delta * delta;
  }
  const stdDev = Math.sqrt(variance / pixels);

  // Precompute the multiplier for all 256 possible luminances instead of
  // recomputing the same curve per pixel -- identical results, and it
  // keeps the inner loop to a table lookup on a buffer that can run to a
  // few hundred thousand pixels.
  const curve = new Float64Array(256);
  const lift = new Float64Array(256);
  for (let l = 0; l < 256; l++) {
    curve[l] = shadingMultiplier(l, mean, stdDev, options);
    lift[l] = highlightLiftLevels(l, mean, stdDev, options);
  }

  const shaded = Buffer.alloc(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const luminance = lum.data[i * lumChannels];
    const multiplier = curve[luminance];
    const sheen = lift[luminance];
    const src = i * artChannels;
    const dst = i * 4;
    for (let c = 0; c < 3; c++) {
      const value = Math.round(art.data[src + c] * multiplier + sheen);
      shaded[dst + c] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
    // Alpha carries the print's shape, never its shading -- modulating it
    // here would make the artwork semi-transparent in folds and let the
    // garment's own colour bleed through the ink, which is a different
    // (and wrong) effect entirely.
    const alpha = Math.round(art.data[src + 3] * options.inkOpacity);
    shaded[dst + 3] = alpha < 0 ? 0 : alpha > 255 ? 255 : alpha;
  }

  try {
    let pipeline = sharp(shaded, {
      raw: { width: art.info.width, height: art.info.height, channels: 4 },
    });

    if (options.edgeSoftenSigma > 0) {
      // Soften the print's OUTLINE only: blur the alpha channel on its
      // own and re-join it, leaving the artwork's colours untouched. A
      // blur of the whole RGBA would smear the design itself, which is
      // not what ink does -- the fibres break up the edge, not the
      // picture.
      const softAlpha = await sharp(shaded, {
        raw: { width: art.info.width, height: art.info.height, channels: 4 },
      })
        .extractChannel(3)
        .blur(options.edgeSoftenSigma)
        .raw()
        .toBuffer();

      const joined = Buffer.alloc(pixels * 4);
      for (let i = 0; i < pixels; i++) {
        joined[i * 4] = shaded[i * 4];
        joined[i * 4 + 1] = shaded[i * 4 + 1];
        joined[i * 4 + 2] = shaded[i * 4 + 2];
        joined[i * 4 + 3] = softAlpha[i];
      }
      pipeline = sharp(joined, {
        raw: { width: art.info.width, height: art.info.height, channels: 4 },
      });
    }

    return await pipeline.png({ compressionLevel: 9 }).toBuffer();
  } catch {
    throw new RendererError("Failed to apply fabric shading to the artwork.", 500);
  }
}
