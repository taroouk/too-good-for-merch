"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import type { GarmentColor, ProductType } from "@prisma/client";
// Both modules have zero server-only imports (no node:fs, no sharp) --
// safe to import directly from a client component. This is the canonical
// placement geometry, the same one the server compositor uses (see
// src/studio/render/placement-config.ts) -- do not add a local
// placement-coordinate table here.
import { getPlacementSide, getTemplateAspectRatio } from "src/studio/render/placement-config";
import { getPlacementStyle } from "src/studio/render/placement-css";
import { previewArtworkBlend } from "src/studio/render/preview-blend";
import { artworkOffsetPx, clampArtworkRotation } from "src/studio/render/transform";
import { useContainerWidth } from "src/studio/ui/useContainerSize";
import { useImageAspectRatio } from "src/studio/ui/useImageAspectRatio";
import { useTrimmedArtworkUrl } from "src/studio/ui/useTrimmedArtworkUrl";

type PreviewSide = "front" | "back";

type PlacementKey =
  | "LEFT_CHEST"
  | "RIGHT_CHEST"
  | "RIGHT_SLEEVE"
  | "LEFT_SLEEVE"
  | "CENTER_FRONT"
  | "FULL_FRONT"
  | "CENTER_BACK"
  | "FULL_BACK";

// One artwork on the model: same { placement, x, y, scale, rotation } as a
// design layer (src/studio/artwork-layers.ts), plus its image URL.
export type PreviewArtwork = {
  placement: PlacementKey;
  url: string;
  x: number;
  y: number;
  scale: number;
  rotation?: number;
};

export type PreviewSideMockup = { url: string | null; isStale: boolean };

type TryOn3DPreviewProps = {
  product: ProductType | null;
  color: GarmentColor | null;
  // Every artwork in the design (front and back); each side shows its own.
  artworks: PreviewArtwork[];
  // The placement being edited -- the preview turns to its side.
  activePlacement?: PlacementKey;
  // The generated mockup for each side (shown instead of the live overlays
  // while it is fresh).
  mockups: Record<PreviewSide, PreviewSideMockup>;
};

// هنا دي صور الموديلز الأصلية بتاعتك بدون أي تغيير
function getFrontModelImage(product: ProductType | null, color: GarmentColor | null): string {
  if (product === "OVERSIZED") {
    return color === "BLACK" ? "/images/Oversized Black.png" : "/images/Oversized White.png";
  }
  return color === "BLACK" ? "/images/TGFM Black.png" : "/images/TGFM White.png";
}

function getBackModelImage(product: ProductType | null, color: GarmentColor | null): string {
  if (product === "OVERSIZED") {
    return color === "BLACK" ? "/images/Oversized Black Back.png" : "/images/Oversized White Back.png";
  }
  return color === "BLACK" ? "/images/TGFM Black Back.png" : "/images/TGFM White Back.png";
}

function getPreviewLabel(product: ProductType | null, color: GarmentColor | null): string {
  const productLabel = product === "OVERSIZED" ? "Oversized" : product === "CUSTOM" ? "Bespoke" : "Fitted";
  const colorLabel = color === "BLACK" ? "Black" : "White";
  return `${productLabel} / ${colorLabel}`;
}

// One live artwork overlay. Its own component because the client-side
// trim (useTrimmedArtworkUrl, a hook) has to run per artwork.
function ArtworkOverlay({
  artwork,
  product,
  color,
  containerWidth,
}: {
  artwork: PreviewArtwork;
  product: ProductType | null;
  color: GarmentColor | null;
  containerWidth: number;
}) {
  // Same alpha-scan trim the server's trimToVisibleBounds runs, so the box
  // aspect ratio matches what sharp-renderer.ts composites.
  const trimmedUrl = useTrimmedArtworkUrl(artwork.url);

  // Canonical placement geometry (placement-config.ts via placement-css.ts).
  const style = useMemo(() => {
    const resolvedProduct: ProductType = product === "OVERSIZED" ? "OVERSIZED" : "FITTED";
    const resolvedColor: GarmentColor = color === "BLACK" ? "BLACK" : "WHITE";
    return getPlacementStyle(resolvedProduct, resolvedColor, artwork.placement);
  }, [product, color, artwork.placement]);

  // x/y are fractions of the container width (transform.ts); P3-21c: rotate
  // about the artwork's own center, matching composite.ts.
  const transform = useMemo(() => {
    const base = typeof style.transform === "string" ? style.transform : "";
    const { x: offsetX, y: offsetY } = artworkOffsetPx(artwork, containerWidth);
    const rotation = clampArtworkRotation(artwork.rotation);
    return `${base} translate(${offsetX}px, ${offsetY}px) scale(${artwork.scale}) rotate(${rotation}deg)`.trim();
  }, [style, artwork, containerWidth]);

  return (
    <img
      src={trimmedUrl ?? artwork.url}
      alt="Artwork overlay"
      style={{ position: "absolute", zIndex: 30, ...previewArtworkBlend(color), ...style, transform }}
      draggable={false}
    />
  );
}

export default function TryOn3DPreview({
  product,
  color,
  artworks,
  activePlacement,
  mockups,
}: TryOn3DPreviewProps) {
  const [previewSide, setPreviewSide] = useState<PreviewSide>("front");

  // ده بيخلي البريفيو الخارجي يلف تلقائي مع اختيارك من المودال
  useEffect(() => {
    if (activePlacement) {
      setPreviewSide(getPlacementSide(activePlacement));
    }
  }, [activePlacement]);

  const frontImage = useMemo(() => getFrontModelImage(product, color), [color, product]);
  const backImage = useMemo(() => getBackModelImage(product, color), [color, product]);
  // Each side shows its own generated mockup while it's fresh; otherwise the
  // plain model photo with that side's artworks overlaid live.
  const sideMockup = mockups[previewSide];
  const showingGeneratedMockup = Boolean(sideMockup?.url && !sideMockup.isStale);
  const modelImage = showingGeneratedMockup
    ? (sideMockup.url as string)
    : previewSide === "front"
      ? frontImage
      : backImage;

  // getTemplateAspectRatio's { front: 1, back: 1024/1536 } table is only a
  // FALLBACK now, used before the actual image has loaded -- it went stale
  // the moment the template PNGs on disk were replaced with differently
  // shaped photos (see useImageAspectRatio's own comment). The real ratio
  // is measured from the actual loaded image's naturalWidth/naturalHeight,
  // per (product, color, side), so front and back always occupy the same
  // container footprint that matches what's ACTUALLY on screen, not a
  // guess that can silently drift out of sync with the asset files again.
  const fallbackAspectRatio = useMemo(() => getTemplateAspectRatio(previewSide), [previewSide]);
  const previewAspectRatio = useImageAspectRatio(modelImage, fallbackAspectRatio);

  const sideArtworks = useMemo(
    () =>
      showingGeneratedMockup
        ? []
        : artworks.filter((artwork) => getPlacementSide(artwork.placement) === previewSide),
    [artworks, previewSide, showingGeneratedMockup],
  );

  // artwork x/y are fractions of the preview container's own width -- track
  // the container's live rendered width to convert them to real px.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerWidth = useContainerWidth(containerRef);

  function cnDot(active: boolean) {
    return active
      ? "studio-preview-side-dot studio-preview-side-dot-active"
      : "studio-preview-side-dot";
  }

  return (
    <section className="studio-preview-panel" aria-label="3D garment preview">
      <div className="studio-preview-chrome">
        <div>
          <div className="studio-preview-kicker">Live Model Preview</div>
          <div className="studio-preview-label">{getPreviewLabel(product, color)}</div>
        </div>
        <div className="studio-preview-status"><span />Ready</div>
      </div>

      <div
        ref={containerRef}
        className="studio-preview-inner studio-preview-inner-clean flex items-center justify-center relative w-full bg-white"
        style={{ aspectRatio: previewAspectRatio }}
      >
        
        {/* دي صورتك الأصلية زي ما هي */}
        <img
          key={modelImage}
          src={modelImage}
          alt="Model preview"
          className="w-full h-full object-contain block relative studio-model-image"
          draggable={false}
          onError={(event) => {
            if (previewSide === "back") {
              event.currentTarget.src = frontImage;
            }
          }}
        />

        {/* Every artwork on the visible side, at the canonical placement geometry. */}
        {sideArtworks.map((artwork) => (
          <ArtworkOverlay
            key={artwork.placement}
            artwork={artwork}
            product={product}
            color={color}
            containerWidth={containerWidth}
          />
        ))}

        <div className="studio-preview-side-switch" aria-label="Preview side switch">
          <button type="button" onClick={() => setPreviewSide(s => s === "front" ? "back" : "front")} className="studio-preview-side-arrow">‹</button>
          <button type="button" onClick={() => setPreviewSide("front")} className={cnDot(previewSide === "front")} />
          <button type="button" onClick={() => setPreviewSide("back")} className={cnDot(previewSide === "back")} />
          <button type="button" onClick={() => setPreviewSide(s => s === "front" ? "back" : "front")} className="studio-preview-side-arrow">›</button>
        </div>
      </div>
    </section>
  );
}
