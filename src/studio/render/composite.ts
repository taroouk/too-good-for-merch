// file: src/studio/render/composite.ts
import sharp from "sharp";
import { RendererError } from "./errors";
import { trimToVisibleBounds } from "./garment-bbox";
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

  try {
    // sharp's .png() strips metadata (no ICC profile, no timestamps) by
    // default unless .withMetadata() is explicitly called, which keeps
    // output deterministic for identical pixel input.
    return await sharp(baseImage)
      .composite([{ input: resizedArtwork, left, top }])
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw new RendererError("Failed to composite artwork onto garment image.", 500);
  }
}
