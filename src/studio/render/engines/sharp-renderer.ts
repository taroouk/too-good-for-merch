// file: src/studio/render/engines/sharp-renderer.ts
import sharp from "sharp";
import { RendererError } from "../errors";
import { BASELINE_RENDER_DPI, resolvePlacement } from "../transform";
import { compositeArtworkOntoBase } from "../composite";
import { trimToVisibleBounds } from "../garment-bbox";
import { getPlacementSide, getTemplateReferenceWidth } from "../placement-config";
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

    // compositeArtworkOntoBase trims the artwork to its own visible
    // (non-transparent) content before resizing it into the resolved box
    // with fit:"fill". If resolvePlacement instead sized that box off the
    // RAW upload's aspect ratio, asymmetric transparent padding (e.g. more
    // padding on top than bottom) would make the box's aspect ratio
    // disagree with the trimmed content's real aspect ratio, and "fill"
    // would stretch/squash the visible artwork to close the gap. Computing
    // the box from the TRIMMED aspect ratio here keeps the box's aspect
    // ratio identical to the content actually being placed into it, so
    // "fill" never has to distort anything.
    const trimmedArtworkMeta = await sharp(await trimToVisibleBounds(artwork)).metadata();
    const trimmedWidth = trimmedArtworkMeta.width ?? artworkMeta.width;
    const trimmedHeight = trimmedArtworkMeta.height ?? artworkMeta.height;

    const resolved = resolvePlacement({
      product,
      color,
      placement,
      transform,
      templateWidth: templateMeta.width,
      templateHeight: templateMeta.height,
      artworkWidth: trimmedWidth,
      artworkHeight: trimmedHeight,
    });

    const composited = await compositeArtworkOntoBase(template, artwork, resolved);

    // dpi is a scale factor relative to BASELINE_RENDER_DPI (see
    // transform.ts) applied to the whole composited output, not just the
    // artwork -- keeping garment and artwork in the same relative scale at
    // any requested resolution.
    const dpiScale = (dpi || BASELINE_RENDER_DPI) / BASELINE_RENDER_DPI;

    // P3-21k: normalize absolute output resolution to a canonical per-
    // (product, side) reference width, scaled by dpiScale -- rather than
    // sizing off the loaded template's own raw pixel dimensions. Template
    // files are NOT consistently sized across colors (TGFM Black.png is a
    // 2480x2480 re-export of the same framing as TGFM White.png's
    // 1254x1254 -- see placement-config.ts's TEMPLATE_REFERENCE_WIDTH
    // comment), so sizing off templateMeta directly would make an
    // otherwise-identical mockup request produce a ~2x larger raster for
    // one color than another. The scale factor is derived from the
    // TEMPLATE'S OWN actual width (referenceWidth / templateMeta.width) and
    // applied uniformly to both of the template's own actual dimensions --
    // NOT a fixed absolute (width, height) target -- so this only
    // normalizes absolute resolution and can never distort or crop the
    // composited image's real aspect ratio, whatever it is.
    const side = getPlacementSide(placement);
    const referenceWidth = getTemplateReferenceWidth(product, side);
    const sizeNormalizationScale = referenceWidth / templateMeta.width;
    const combinedScale = sizeNormalizationScale * dpiScale;
    const targetWidth = Math.max(1, Math.round(templateMeta.width * combinedScale));
    const targetHeight = Math.max(1, Math.round(templateMeta.height * combinedScale));

    let data = composited;
    if (targetWidth !== templateMeta.width || targetHeight !== templateMeta.height) {
      try {
        data = await sharp(composited)
          .resize({ width: targetWidth, height: targetHeight, fit: "fill" })
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
      width: outputMeta.width ?? targetWidth,
      height: outputMeta.height ?? targetHeight,
    };
  }
}
