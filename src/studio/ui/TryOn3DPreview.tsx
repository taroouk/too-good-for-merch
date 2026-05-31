"use client";

import { useMemo, useState, useEffect } from "react";
import type { GarmentColor, ProductType } from "@prisma/client";

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
};

const PLACEMENT_SIDES: Record<PlacementKey, "front" | "back"> = {
  LEFT_CHEST: "front",
  RIGHT_CHEST: "front",
  CENTER_FRONT: "front",
  FULL_FRONT: "front",
  RIGHT_SLEEVE: "front",
  LEFT_SLEEVE: "front",
  CENTER_BACK: "back",
  FULL_BACK: "back",
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

export default function TryOn3DPreview({ product, color, artworkUrl, activePlacement }: TryOn3DPreviewProps) {
  const [previewSide, setPreviewSide] = useState<PreviewSide>("front");

  // ده بيخلي البريفيو الخارجي يلف تلقائي مع اختيارك من المودال
  useEffect(() => {
    if (activePlacement && PLACEMENT_SIDES[activePlacement]) {
      setPreviewSide(PLACEMENT_SIDES[activePlacement]);
    }
  }, [activePlacement]);

  const frontImage = useMemo(() => getFrontModelImage(product, color), [color, product]);
  const backImage = useMemo(() => getBackModelImage(product, color), [color, product]);
  const modelImage = previewSide === "front" ? frontImage : backImage;

  const shouldShowArtwork = useMemo(() => {
    if (!artworkUrl || !activePlacement) return false;
    return previewSide === (PLACEMENT_SIDES[activePlacement] || "front");
  }, [artworkUrl, activePlacement, previewSide]);

  // دي الإحداثيات المخصصة عشان اللوجو ينزل على صورة الموديل (البنت) بالظبط بدون أي ترحيل
  const artworkStyle = useMemo(() => {
    if (!activePlacement) return {};
    const isOversized = product === "OVERSIZED";
    const styles: Record<"OVERSIZED" | "FITTED", Record<PlacementKey, React.CSSProperties>> = {
      OVERSIZED: {
        CENTER_FRONT: { top: "48%", left: "50%", transform: "translateX(-50%)", width: "22%", height: "auto" },
        FULL_FRONT: { top: "46%", left: "50%", transform: "translateX(-50%)", width: "26%", height: "auto" },
        LEFT_CHEST: { top: "48%", left: "43%", width: "6%", height: "auto" },
        RIGHT_CHEST: { top: "48%", left: "51%", width: "6%", height: "auto" },
        CENTER_BACK: { top: "48%", left: "50%", transform: "translateX(-50%)", width: "22%", height: "auto" },
        FULL_BACK: { top: "46%", left: "50%", transform: "translateX(-50%)", width: "28%", height: "auto" },
        LEFT_SLEEVE: { top: "50%", left: "33%", width: "6%", height: "auto" },
        RIGHT_SLEEVE: { top: "50%", left: "61%", width: "6%", height: "auto" },
      },
      FITTED: {
        CENTER_FRONT: { top: "50%", left: "50%", transform: "translateX(-50%)", width: "18%", height: "auto" },
        FULL_FRONT: { top: "46%", left: "50%", transform: "translateX(-50%)", width: "23%", height: "auto" },
        LEFT_CHEST: { top: "49%", left: "44%", width: "5.5%", height: "auto" },
        RIGHT_CHEST: { top: "49%", left: "51%", width: "5.5%", height: "auto" },
        CENTER_BACK: { top: "50%", left: "50%", transform: "translateX(-50%)", width: "18%", height: "auto" },
        FULL_BACK: { top: "46%", left: "50%", transform: "translateX(-50%)", width: "25%", height: "auto" },
        LEFT_SLEEVE: { top: "50%", left: "35%", width: "5%", height: "auto" },
        RIGHT_SLEEVE: { top: "50%", left: "60%", width: "5%", height: "auto" },
      },
    };
    const key = isOversized ? "OVERSIZED" : "FITTED";
    return styles[key][activePlacement];
  }, [product, activePlacement]);

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

      <div className="studio-preview-inner studio-preview-inner-clean flex items-center justify-center relative aspect-square w-full bg-white">
        
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
              ...artworkStyle 
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