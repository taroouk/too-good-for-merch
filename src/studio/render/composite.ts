// file: src/studio/render/composite.ts
import sharp from "sharp";
import { RendererError } from "./errors";
import { trimToVisibleBounds } from "./garment-bbox";
import {
  DEFAULT_FABRIC_SHADING,
  applyFabricShading,
  canSampleShadingRegion,
  type FabricShadingOptions,
} from "./fabric-shading";
import type { ResolvedPlacement } from "./types";

// Shared by both the deterministic Print Mockup renderer (artwork onto the
// clean template) and the AI Mockup post-compositor (artwork onto Gemini's
// photorealistic garment) -- the actual pixel-level compositing mechanics
// (resize artwork to the resolved box, rotate around its own center if
// requested, recompute the post-rotation offset, composite onto the base
// image) must be identical in both places; only the base image and the
// resolved geometry passed in differ. Extracted from sharp-renderer.ts
// so there is exactly one place that performs this compositing, not two
// copies that could drift apart.
export async function compositeArtworkOntoBase(
  baseImage: Buffer,
  artwork: Buffer,
  resolved: ResolvedPlacement,
  // Fabric realism (see fabric-shading.ts): the garment's own light, shade
  // and folds re-applied to the print, plus ink absorption. Pass
  // `{ ...DEFAULT_FABRIC_SHADING, strength: 0 }` -- or null -- for the
  // bare geometric composite. Defaulted ON deliberately: both callers (the
  // Print Mockup and the AI Mockup post-composite) put artwork onto a
  // photograph of real fabric, and both looked like stickers without it.
  shading: FabricShadingOptions | null = DEFAULT_FABRIC_SHADING,
): Promise<Buffer> {
  // Trim to the artwork's own visible content FIRST, before anything below
  // reads its dimensions -- so resolved.width/height (the user's configured
  // scale) get applied to the visible artwork, not a transparent-padded
  // canvas around it. Errors here (e.g. a fully-transparent upload) are
  // already an actionable RendererError -- let them propagate as-is rather
  // than being swallowed into the generic message in the catch block below.
  const trimmedArtwork = await trimToVisibleBounds(artwork);

  let resizedArtwork: Buffer;
  try {
    let pipeline = sharp(trimmedArtwork)
      .resize({
        width: resolved.width,
        height: resolved.height,
        fit: "fill",
        withoutEnlargement: false,
      })
      .ensureAlpha();

    if (resolved.rotation) {
      pipeline = pipeline.rotate(resolved.rotation, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    }

    resizedArtwork = await pipeline.png().toBuffer();
  } catch {
    throw new RendererError("Artwork could not be resized for compositing.", 500);
  }

  // Rotation can grow the resized buffer's bounding box beyond
  // resolved.width/height; re-read actual dimensions so the composite
  // offset centers correctly on the originally resolved anchor point.
  const resizedMeta = await sharp(resizedArtwork).metadata();
  const actualWidth = resizedMeta.width ?? resolved.width;
  const actualHeight = resizedMeta.height ?? resolved.height;
  const left = Math.round(resolved.left - (actualWidth - resolved.width) / 2);
  const top = Math.round(resolved.top - (actualHeight - resolved.height) / 2);

  // Transfer the garment's own shading onto the print before compositing.
  // Sampled from the exact pixels the print is about to cover, at the
  // exact offset it will land on, so folds line up with the fabric they
  // come from. Skipped when the placement is not fully on the base image
  // (nothing to sample -- see canSampleShadingRegion) or when shading is
  // switched off, in which case this is the original flat composite.
  let printLayer = resizedArtwork;
  if (shading && shading.strength > 0) {
    const baseMeta = await sharp(baseImage).metadata();
    const region = { left, top, width: actualWidth, height: actualHeight };
    if (canSampleShadingRegion(region, baseMeta.width ?? 0, baseMeta.height ?? 0)) {
      let garmentUnderPrint: Buffer;
      try {
        garmentUnderPrint = await sharp(baseImage).extract(region).png().toBuffer();
      } catch {
        throw new RendererError("Failed to sample the garment under the artwork.", 500);
      }
      printLayer = await applyFabricShading(resizedArtwork, garmentUnderPrint, shading);
    }
  }

  try {
    // sharp's .png() strips metadata (no ICC profile, no timestamps) by
    // default unless .withMetadata() is explicitly called, which keeps
    // output deterministic for identical pixel input.
    return await sharp(baseImage)
      .composite([{ input: printLayer, left, top }])
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw new RendererError("Failed to composite artwork onto garment image.", 500);
  }
}

// The model/garment template photos have transparent backgrounds (~30% of
// pixels) and soft semi-transparent edges (hair, shoulders). Gemini returns
// an opaque JPEG, so splicing its crop back over the template turned every
// transparent pixel inside the crop black and hard-edged the silhouette
// (most visible on the Oversized photos, whose subject crop takes in more
// background). Re-applying the template's OWN alpha channel after the
// splice puts the original transparency and soft edges back exactly; the
// garment itself is fully opaque in the template, so prints are unaffected.
export async function restoreTemplateAlpha(image: Buffer, template: Buffer): Promise<Buffer> {
  const templateMeta = await sharp(template).metadata();
  if (!templateMeta.hasAlpha) return image;
  const width = templateMeta.width ?? 0;
  const height = templateMeta.height ?? 0;
  // Assembled by hand from raw buffers: sharp's joinChannel() did not carry
  // the alpha values through unchanged (verified: ~35% of pixels differed),
  // while copying the bytes guarantees the template's exact alpha.
  const rgb = await sharp(image).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const alpha = await sharp(template).ensureAlpha().extractChannel(3).raw().toBuffer();
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

// Gemini answers with a SQUARE image whatever it is sent (observed: a tall
// 603x1185 crop came back 1024x1024). Stretching that square onto the tall
// crop is what elongated the model's face and body in AI mockups of tall
// garment photos. So the crop is sent centred on a white SQUARE canvas and,
// once Gemini has answered, the same rectangle is cut back out of its
// square answer -- no stretching anywhere, whatever the crop's shape.
export type SquareFrame = { side: number; padX: number; padY: number; width: number; height: number };

export function squareFrameFor(width: number, height: number): SquareFrame {
  const side = Math.max(width, height);
  return { side, padX: Math.floor((side - width) / 2), padY: Math.floor((side - height) / 2), width, height };
}

// `crop` (already flattened onto white) centred on a white side x side canvas.
export async function padCropToSquare(crop: Buffer, frame: SquareFrame): Promise<Buffer> {
  return sharp({ create: { width: frame.side, height: frame.side, channels: 3, background: "#ffffff" } })
    .composite([{ input: crop, left: frame.padX, top: frame.padY }])
    .png()
    .toBuffer();
}

// Cuts the original crop rectangle back out of Gemini's (square) answer.
// The answer is first scaled to side x side -- an identity-shaped resize,
// since both are square -- so the offsets line up whatever its pixel size.
export async function cropOutOfSquare(generated: Buffer, frame: SquareFrame): Promise<Buffer> {
  return sharp(generated)
    .resize({ width: frame.side, height: frame.side, fit: "fill" })
    .extract({ left: frame.padX, top: frame.padY, width: frame.width, height: frame.height })
    .toBuffer();
}
