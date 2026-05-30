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

function getArtworkClassName(product: ProductType | null) {
  if (product === "OVERSIZED") {
    return "studio-artwork-preview studio-artwork-preview-oversized";
  }

  if (product === "CUSTOM") {
    return "studio-artwork-preview studio-artwork-preview-bespoke";
  }

  return "studio-artwork-preview studio-artwork-preview-fitted";
}

export default function TryOn3DPreview({
  product,
  color,
  artworkUrl,
}: TryOn3DPreviewProps) {
  const [previewSide, setPreviewSide] = useState<PreviewSide>("front");

  const frontImage = useMemo(
    () => getFrontModelImage(product, color),
    [color, product],
  );

  const backImage = useMemo(
    () => getBackModelImage(product, color),
    [color, product],
  );

  const modelImage = previewSide === "front" ? frontImage : backImage;

  function showFront() {
    setPreviewSide("front");
  }

  function showBack() {
    setPreviewSide("back");
  }

  function showPrevious() {
    setPreviewSide((side) => (side === "front" ? "back" : "front"));
  }

  function showNext() {
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

      <div className="studio-preview-inner studio-preview-inner-clean">
        <div className="studio-preview-gridline studio-preview-gridline-left" />
        <div className="studio-preview-gridline studio-preview-gridline-right" />
        <div className="studio-preview-glow" />
        <div className="studio-preview-stage-shadow" />

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
            className={getArtworkClassName(product)}
            draggable={false}
          />
        ) : null}

        <div className="studio-preview-side-switch" aria-label="Preview side switch">
          <button
            type="button"
            onClick={showPrevious}
            aria-label="Previous preview side"
            className="studio-preview-side-arrow"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={showFront}
            aria-label="Show front preview"
            className={cnDot(previewSide === "front")}
          />

          <button
            type="button"
            onClick={showBack}
            aria-label="Show back preview"
            className={cnDot(previewSide === "back")}
          />

          <button
            type="button"
            onClick={showNext}
            aria-label="Next preview side"
            className="studio-preview-side-arrow"
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}

function cnDot(active: boolean) {
  return active
    ? "studio-preview-side-dot studio-preview-side-dot-active"
    : "studio-preview-side-dot";
}