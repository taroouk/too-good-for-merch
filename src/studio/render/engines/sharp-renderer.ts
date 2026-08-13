// file: src/studio/render/engines/sharp-renderer.ts
import sharp from "sharp";
import { RendererError } from "../errors";
import { BASELINE_RENDER_DPI, resolvePlacement } from "../transform";
import { compositeArtworkOntoBase } from "../composite";
import type { MockupRenderer, RenderRequest, RenderedMockup } from "../types";

// Deterministic: identical RenderRequest -> byte-identical output. No RNG,
// no network calls, no metadata that varies run to run (timestamps, etc.).
export class SharpMockupRenderer implements MockupRenderer {
  async render(req: RenderRequest): Promise<RenderedMockup> {
    const { artwork, template, product, color, placement, transform, dpi } = req;

    let templateImage: sharp.Sharp;
    let templateMeta: sharp.Metadata;
    try {
      templateImage = sharp(template);
      templateMeta = await templateImage.metadata();
    } catch {
      throw new RendererError("Garment template image could not be read.", 500);
    }

    if (!templateMeta.width || !templateMeta.height) {
      throw new RendererError("Garment template image is missing dimensions.", 500);
    }

    let artworkImage: sharp.Sharp;
    let artworkMeta: sharp.Metadata;
    try {
      artworkImage = sharp(artwork);
      artworkMeta = await artworkImage.metadata();
    } catch {
      throw new RendererError("Artwork image could not be read.", 400);
    }

    if (!artworkMeta.width || !artworkMeta.height) {
      throw new RendererError("Artwork image is missing dimensions.", 400);
    }

    const resolved = resolvePlacement({
      product,
      color,
      placement,
      transform,
      templateWidth: templateMeta.width,
      templateHeight: templateMeta.height,
      artworkWidth: artworkMeta.width,
      artworkHeight: artworkMeta.height,
    });

    const composited = await compositeArtworkOntoBase(template, artwork, resolved);

    // dpi is a scale factor relative to BASELINE_RENDER_DPI (see
    // transform.ts) applied to the whole composited output, not just the
    // artwork -- keeping garment and artwork in the same relative scale at
    // any requested resolution.
    const dpiScale = (dpi || BASELINE_RENDER_DPI) / BASELINE_RENDER_DPI;
    let data = composited;
    if (Math.abs(dpiScale - 1) > 1e-6) {
      try {
        data = await sharp(composited)
          .resize({
            width: Math.max(1, Math.round(templateMeta.width * dpiScale)),
            height: Math.max(1, Math.round(templateMeta.height * dpiScale)),
            fit: "fill",
          })
          .png({ compressionLevel: 9 })
          .toBuffer();
      } catch {
        throw new RendererError("Failed to scale composited output to the requested DPI.", 500);
      }
    }

    const outputMeta = await sharp(data).metadata();

    return {
      data,
      mimeType: "image/png",
      width: outputMeta.width ?? templateMeta.width,
      height: outputMeta.height ?? templateMeta.height,
    };
  }
}
