// file: src/studio/render/placement-config.ts
//
// Single source of truth for placement geometry, shared by the server
// compositor (sharp-renderer.ts) and, eventually, the client preview.
// No server-only imports (no `sharp`, no `node:fs`) so this module stays
// safe to import from client components.
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import type { GarmentSide, PlacementBox, TemplateRef } from "./types";
import { RendererError } from "./errors";

// Values below are carried over as-is from the two previously-duplicated
// hardcoded CSS tables (src/studio/ui/TryOn3DPreview.tsx and the bespoke
// modal's coordinate table in BuilderClient.tsx), converted from their
// top/left/width CSS percentages (some center-anchored via translateX(-50%),
// some top-left-anchored) into a single consistent top-left-anchored
// (xPct, yPct, widthPct) box. These are a starting approximation carried
// over from already-tuned UI values, not re-derived from scratch — they
// should be visually verified against the actual template images once the
// compositor is wired up end-to-end.
//
// Garment color does not currently affect placement position in this
// codebase (only which template image loads, see getGarmentTemplate) — both
// BLACK and WHITE share the same box per (product, placement), matching
// TryOn3DPreview.tsx today. The lookup below is keyed by product only; the
// public getPlacementBox() still accepts color for API stability in case
// color-specific geometry is needed later.
const FITTED_BOXES: Record<PlacementType, PlacementBox> = {
  CENTER_FRONT: { xPct: 0.41, yPct: 0.5, widthPct: 0.18 },
  FULL_FRONT: { xPct: 0.385, yPct: 0.46, widthPct: 0.23 },
  LEFT_CHEST: { xPct: 0.44, yPct: 0.49, widthPct: 0.055 },
  RIGHT_CHEST: { xPct: 0.51, yPct: 0.49, widthPct: 0.055 },
  // BACK boxes below are calibrated separately from FRONT -- the back
  // template (TGFM White/Black Back.png, 1024x1536) has different photo
  // framing than the front template, so identical (xPct, yPct) values do
  // NOT land on the same physical body location. Measured directly by
  // sampling pixels down the panel's horizontal center on the real back
  // template: the shirt fabric itself spans yFrac 0.286-0.716 (y=440-1100
  // of 1536px), not the 0-1 range the old copied-from-front values assumed.
  // yPct below targets the upper third of that measured span (shoulder-
  // blade height), mirroring how CENTER_FRONT/FULL_FRONT sit on the chest.
  // xPct/widthPct were already correctly centered on the back panel, so
  // only yPct changes here. See scripts/investigate-geometry.mjs.
  CENTER_BACK: { xPct: 0.41, yPct: 0.4, widthPct: 0.18 },
  FULL_BACK: { xPct: 0.375, yPct: 0.36, widthPct: 0.25 },
  LEFT_SLEEVE: { xPct: 0.35, yPct: 0.5, widthPct: 0.05 },
  RIGHT_SLEEVE: { xPct: 0.6, yPct: 0.5, widthPct: 0.05 },
};

const OVERSIZED_BOXES: Record<PlacementType, PlacementBox> = {
  CENTER_FRONT: { xPct: 0.39, yPct: 0.48, widthPct: 0.22 },
  FULL_FRONT: { xPct: 0.37, yPct: 0.46, widthPct: 0.26 },
  LEFT_CHEST: { xPct: 0.43, yPct: 0.48, widthPct: 0.06 },
  RIGHT_CHEST: { xPct: 0.51, yPct: 0.48, widthPct: 0.06 },
  // See the FITTED_BOXES comment above -- same recalibration, measured
  // against Oversized White/Black Back.png (yFrac 0.271-0.708 measured).
  CENTER_BACK: { xPct: 0.39, yPct: 0.38, widthPct: 0.22 },
  FULL_BACK: { xPct: 0.36, yPct: 0.36, widthPct: 0.28 },
  LEFT_SLEEVE: { xPct: 0.33, yPct: 0.5, widthPct: 0.06 },
  RIGHT_SLEEVE: { xPct: 0.61, yPct: 0.5, widthPct: 0.06 },
};

const PLACEMENT_SIDES: Record<PlacementType, GarmentSide> = {
  LEFT_CHEST: "front",
  RIGHT_CHEST: "front",
  RIGHT_SLEEVE: "front",
  LEFT_SLEEVE: "front",
  CENTER_FRONT: "front",
  FULL_FRONT: "front",
  CENTER_BACK: "back",
  FULL_BACK: "back",
};

const TEMPLATE_FILES: Record<ProductType, Record<GarmentColor, Record<GarmentSide, string>>> = {
  FITTED: {
    BLACK: { front: "TGFM Black.png", back: "TGFM Black Back.png" },
    WHITE: { front: "TGFM White.png", back: "TGFM White Back.png" },
    CUSTOM: { front: "TGFM White.png", back: "TGFM White Back.png" },
  },
  OVERSIZED: {
    BLACK: { front: "Oversized Black.png", back: "Oversized Black Back.png" },
    WHITE: { front: "Oversized White.png", back: "Oversized White Back.png" },
    CUSTOM: { front: "Oversized White.png", back: "Oversized White Back.png" },
  },
  CUSTOM: {
    BLACK: { front: "TGFM Black.png", back: "TGFM Black Back.png" },
    WHITE: { front: "TGFM White.png", back: "TGFM White Back.png" },
    CUSTOM: { front: "TGFM White.png", back: "TGFM White Back.png" },
  },
};

function boxesForProduct(product: ProductType): Record<PlacementType, PlacementBox> {
  return product === "OVERSIZED" ? OVERSIZED_BOXES : FITTED_BOXES;
}

export function getPlacementSide(placement: PlacementType): GarmentSide {
  return PLACEMENT_SIDES[placement];
}

export function getPlacementBox(
  product: ProductType,
  color: GarmentColor,
  placement: PlacementType,
): PlacementBox {
  void color;
  const box = boxesForProduct(product)[placement];
  if (!box) {
    throw new RendererError(`No placement box configured for ${product}/${placement}.`, 400);
  }
  return box;
}

export function getGarmentTemplate(
  product: ProductType,
  color: GarmentColor,
  side: GarmentSide,
): TemplateRef {
  const file = TEMPLATE_FILES[product]?.[color]?.[side];
  if (!file) {
    throw new RendererError(`No garment template configured for ${product}/${color}/${side}.`, 400);
  }
  return { product, color, side, file };
}
