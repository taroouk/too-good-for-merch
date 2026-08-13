"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import type { GarmentColor, ProductType } from "@prisma/client";
// Both modules have zero server-only imports (no node:fs, no sharp) --
// safe to import directly from a client component. This is the canonical
// placement geometry, the same one the server compositor uses (see
// src/studio/render/placement-config.ts) -- do not add a local
// placement-coordinate table here.
import { getPlacementSide } from "src/studio/render/placement-config";
import { getPlacementStyle } from "src/studio/render/placement-css";
import { useContainerWidth } from "src/studio/ui/useContainerSize";

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

type TryOn3DPreviewProps = {
  product: ProductType | null;
  color: GarmentColor | null;
  artworkUrl: string | null;
  activePlacement?: PlacementKey;
  artworkTransform?: {
    x: number;
    y: number;
    scale: number;
  };
  generatedMockupUrl?: string | null;
  isMockupStale?: boolean;
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

export default function TryOn3DPreview({
  product,
  color,
  artworkUrl,
  activePlacement,
  artworkTransform,
  generatedMockupUrl,
  isMockupStale,
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
  const generatedMockupSide = activePlacement ? getPlacementSide(activePlacement) : "front";
  const showingGeneratedMockup = Boolean(
    generatedMockupUrl && previewSide === generatedMockupSide && !isMockupStale,
  );
  const modelImage = showingGeneratedMockup
    ? generatedMockupUrl!
    : previewSide === "front"
      ? frontImage
      : backImage;

  const shouldShowArtwork = useMemo(() => {
    if (showingGeneratedMockup) return false;
    if (!artworkUrl || !activePlacement) return false;
    return previewSide === getPlacementSide(activePlacement);
  }, [artworkUrl, activePlacement, previewSide, showingGeneratedMockup]);

  // Canonical placement geometry -- the same shared config the server
  // compositor renders from (src/studio/render/placement-config.ts),
  // converted to CSS via placement-css.ts. No local coordinate table here.
  const artworkStyle = useMemo(() => {
    if (!activePlacement) return {};
    const resolvedProduct: ProductType = product === "OVERSIZED" ? "OVERSIZED" : "FITTED";
    const resolvedColor: GarmentColor = color === "BLACK" ? "BLACK" : "WHITE";
    return getPlacementStyle(resolvedProduct, resolvedColor, activePlacement);
  }, [product, color, activePlacement]);

  // artworkTransform.x/y are fractions of the preview container's own
  // width (see src/studio/render/transform.ts) -- track the container's
  // live rendered width (fluid, w-full) to convert back to real px for
  // CSS translate().
  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerWidth = useContainerWidth(containerRef);
  const artworkTransformStyle = useMemo(() => {
    const baseTransform = typeof artworkStyle.transform === "string" ? artworkStyle.transform : "";
    const transform = artworkTransform ?? { x: 0, y: 0, scale: 1 };
    const offsetX = transform.x * containerWidth;
    const offsetY = transform.y * containerWidth;
    return `${baseTransform} translate(${offsetX}px, ${offsetY}px) scale(${transform.scale})`.trim();
  }, [artworkStyle, artworkTransform, containerWidth]);

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
        className="studio-preview-inner studio-preview-inner-clean flex items-center justify-center relative aspect-square w-full bg-white"
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

        {/* ده اللوجو اللي بينزل فوق صورتك الأصلية بالإحداثيات المظبوطة */}
        {shouldShowArtwork ? (
          <img
            src={artworkUrl!}
            alt="Artwork overlay"
            style={{ 
              position: "absolute", 
              zIndex: 30, 
              mixBlendMode: color === "WHITE" ? "multiply" : "normal",
              opacity: color === "WHITE" ? 0.95 : 1,
              ...artworkStyle,
              transform: artworkTransformStyle,
            }}
            draggable={false}
          />
        ) : null}

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
