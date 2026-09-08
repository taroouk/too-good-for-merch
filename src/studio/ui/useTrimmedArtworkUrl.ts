"use client";

// Client-side counterpart to the server's trimToVisibleBounds
// (src/studio/render/garment-bbox.ts). The Sharp renderer trims the
// artwork to its visible (non-transparent) content before sizing/placing
// it -- see sharp-renderer.ts's comment on why: without that, asymmetric
// transparent padding around a logo makes the placement box's aspect ratio
// (derived from the RAW upload) disagree with the trimmed content's real
// aspect ratio, and compositeArtworkOntoBase's fit:"fill" resize distorts
// the visible artwork to close the gap.
//
// The live preview (<img src={artworkUrl} style={{ width: pct, height:
// "auto" }} />) used to size itself off the RAW image's intrinsic aspect
// ratio -- the padding included -- so for the same transform/placement, the
// preview's box and the server's rendered box disagreed on aspect ratio
// whenever the upload had asymmetric transparent padding. This hook closes
// that gap by trimming client-side using the EXACT SAME pure scan
// (scanAboveThresholdBBox from src/studio/render/alpha-trim.ts, same
// threshold, same requireNeighbor=false semantics as trimToVisibleBounds)
// and returning a cropped data: URL whose intrinsic aspect ratio matches
// what the server places, instead of re-deriving a second geometry
// definition here.
import { useEffect, useState } from "react";
import { scanAboveThresholdBBox } from "src/studio/render/alpha-trim";

// Module-level cache: the same artworkUrl is re-rendered on every transform
// drag/zoom tick, but its trimmed content never changes -- no need to
// re-decode + re-scan the image on every frame.
const trimmedUrlCache = new Map<string, string>();

function trimImageElement(img: HTMLImageElement, sourceUrl: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) return sourceUrl;

  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // requireNeighbor=false: same choice trimToVisibleBounds makes, for the
  // same reason (a deliberately tiny/thin piece of real artwork must not be
  // discarded as if it were a photographed-garment scan artifact).
  const { minX, minY, maxX, maxY } = scanAboveThresholdBBox(data, width, height, 4, false);

  // Fully transparent upload, or no alpha channel at all (opaque
  // JPEG/PNG): nothing to trim, or nothing visible to trim TO. Either way,
  // fall back to the untouched source rather than producing an empty crop.
  if (maxX < minX) return sourceUrl;

  // No-op fast path: content already fills the canvas edge-to-edge (a
  // tightly-cropped upload) -- avoid an unnecessary re-encode.
  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
    return sourceUrl;
  }

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) return sourceUrl;
  cropCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return cropCanvas.toDataURL("image/png");
}

// Returns a URL pointing at the artwork trimmed to its visible content
// (same trim the server applies before placing it), or the original
// artworkUrl while the trim is still being computed / if it fails (a
// CORS-tainted canvas from a cross-origin artworkUrl, decode failure,
// etc.) -- degrading to the pre-parity-fix behavior rather than breaking
// the preview.
export function useTrimmedArtworkUrl(artworkUrl: string | null | undefined): string | null {
  const [trimmedUrl, setTrimmedUrl] = useState<string | null>(
    artworkUrl ? (trimmedUrlCache.get(artworkUrl) ?? null) : null,
  );

  useEffect(() => {
    if (!artworkUrl) {
      setTrimmedUrl(null);
      return;
    }
    const cached = trimmedUrlCache.get(artworkUrl);
    if (cached) {
      setTrimmedUrl(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      let result = artworkUrl;
      try {
        result = trimImageElement(img, artworkUrl);
      } catch {
        // Cross-origin canvas taint or decode error -- fall back to the
        // untrimmed artwork; only geometry parity for padded uploads is
        // affected, not correctness of what's shown.
        result = artworkUrl;
      }
      trimmedUrlCache.set(artworkUrl, result);
      if (!cancelled) setTrimmedUrl(result);
    };
    img.onerror = () => {
      if (!cancelled) setTrimmedUrl(artworkUrl);
    };
    img.src = artworkUrl;

    return () => {
      cancelled = true;
    };
  }, [artworkUrl]);

  return trimmedUrl ?? artworkUrl ?? null;
}
