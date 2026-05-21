"use client";

import { useMemo, useState } from "react";
import type { GarmentColor, ProductType } from "@prisma/client";

type PreviewSide = "front" | "back";

type TryOn3DPreviewProps = {
  product: ProductType | null;
  color: GarmentColor | null;
  artworkUrl: string | null;
};

function getFrontModelImage(
  product: ProductType | null,
  color: GarmentColor | null,
): string {
  if (product === "OVERSIZED") {
    return color === "BLACK"
      ? "/images/Oversized Black.png"
      : "/images/Oversized White.png";
  }

  return color === "BLACK"
    ? "/images/TGFM Black.png"
    : "/images/TGFM White.png";
}

function getBackModelImage(
  product: ProductType | null,
  color: GarmentColor | null,
): string {
  if (product === "OVERSIZED") {
    return color === "BLACK"
      ? "/images/Oversized Black Back.png"
      : "/images/Oversized White Back.png";
  }

  return color === "BLACK"
    ? "/images/TGFM Black Back.png"
    : "/images/TGFM White Back.png";
}

function getPreviewLabel(
  product: ProductType | null,
  color: GarmentColor | null,
): string {
  const productLabel =
    product === "OVERSIZED"
      ? "Oversized"
      : product === "CUSTOM"
        ? "Bespoke"
        : "Fitted";

  const colorLabel = color === "BLACK" ? "Black" : "White";

  return `${productLabel} / ${colorLabel}`;
}

export default function TryOn3DPreview({
  product,
  color,
  artworkUrl,
}: TryOn3DPreviewProps) {
  const [previewSide, setPreviewSide] = useState<PreviewSide>("front");

  const frontImage = useMemo(
    () => getFrontModelImage(product, color),
    [product, color],
  );

  const backImage = useMemo(
    () => getBackModelImage(product, color),
    [product, color],
  );

  const modelImage = previewSide === "front" ? frontImage : backImage;

  function togglePreviewSide() {
    setPreviewSide((side) => (side === "front" ? "back" : "front"));
  }

  return (
    <section className="studio-preview-panel" aria-label="3D garment preview">
      <div className="studio-preview-chrome">
        <div>
          <div className="studio-preview-kicker">Live Model Preview</div>

          <div className="studio-preview-label">
            {getPreviewLabel(product, color)}
          </div>
        </div>

        <div className="studio-preview-status">
          <span />
          Ready
        </div>
      </div>

      <div
        className="studio-preview-inner studio-preview-inner-clean"
        style={{
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="studio-preview-gridline studio-preview-gridline-left" />
        <div className="studio-preview-gridline studio-preview-gridline-right" />
        <div className="studio-preview-glow" />

        <img
          key={modelImage}
          src={modelImage}
          alt={
            previewSide === "front"
              ? "TGFM front model preview"
              : "TGFM back model preview"
          }
          className="studio-model-image"
          draggable={false}
          onError={(event) => {
            if (previewSide === "back") {
              event.currentTarget.src = frontImage;
            }
          }}
        />

        {artworkUrl && previewSide === "front" ? (
          <img
            src={artworkUrl}
            alt="Artwork preview"
            className="studio-artwork-preview"
            draggable={false}
          />
        ) : null}

        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 74,
            zIndex: 999999,
            width: 156,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 13,
            border: "2px solid #000000",
            borderRadius: 999,
            background: "#ffffff",
            transform: "translateX(-50%)",
            boxShadow: "0 18px 34px rgba(0,0,0,0.14)",
          }}
          aria-label="Preview side switch"
        >
          <button
            type="button"
            onClick={togglePreviewSide}
            aria-label="Previous preview side"
            style={{
              width: 24,
              height: 24,
              border: 0,
              padding: 0,
              background: "transparent",
              color: "#000000",
              fontSize: 22,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ‹
          </button>

          <button
            type="button"
            onClick={() => setPreviewSide("front")}
            aria-label="Show front preview"
            style={{
              width: previewSide === "front" ? 10 : 8,
              height: previewSide === "front" ? 10 : 8,
              border: 0,
              padding: 0,
              borderRadius: 999,
              background: previewSide === "front" ? "#000000" : "#d8d8d8",
            }}
          />

          <button
            type="button"
            onClick={() => setPreviewSide("back")}
            aria-label="Show back preview"
            style={{
              width: previewSide === "back" ? 10 : 8,
              height: previewSide === "back" ? 10 : 8,
              border: 0,
              padding: 0,
              borderRadius: 999,
              background: previewSide === "back" ? "#000000" : "#d8d8d8",
            }}
          />

          <button
            type="button"
            onClick={togglePreviewSide}
            aria-label="Next preview side"
            style={{
              width: 24,
              height: 24,
              border: 0,
              padding: 0,
              background: "transparent",
              color: "#000000",
              fontSize: 22,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}