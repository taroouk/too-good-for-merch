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

// Real measured pixel dimensions of the template files above (verified via
// `sharp(...).metadata()` against every file in TEMPLATE_FILES): every FRONT
// template is a true 1:1 square (TGFM White/Oversized*.png are 1254x1254;
// TGFM Black.png is a higher-res 2480x2480 re-export of the identical
// framing -- same aspect ratio, just double the resolution). Every BACK
// template (TGFM/Oversized *Back.png) is 1024x1536 -- a 2:3 portrait, NOT
// square. This is the one fact the client preview got wrong: its container
// was hardcoded to aspect-ratio 1/1 for both sides (see
// TryOn3DPreview.tsx/BespokeModal.tsx), which silently pillarboxed the real
// back photo inside object-fit:"contain" and threw off the artwork-overlay
// percentages that assume the image fills the container exactly. Exporting
// the real ratio here (not re-deriving it ad hoc per component) keeps this
// file the single source of truth for anything template-geometry-shaped,
// exactly like PlacementBox/getPlacementBox above -- it does not change
// resolvePlacement()'s own math at all, which already reads each template's
// actual width/height via sharp().metadata() and was never affected by this.
const TEMPLATE_ASPECT_RATIO: Record<GarmentSide, number> = {
  front: 1,
  back: 1024 / 1536,
};

export function getTemplateAspectRatio(side: GarmentSide): number {
  return TEMPLATE_ASPECT_RATIO[side];
}

// P3-21k: TGFM Black.png (FITTED/BLACK/front) is a 2480x2480 re-export of
// the identical framing as TGFM White.png (1254x1254) -- same aspect ratio,
// double the resolution (see the comment above). sharp-renderer.ts used to
// size its final output off each template's own raw metadata dimensions, so
// an otherwise-identical mockup request (same product/placement/transform/
// artwork/dpi) produced a ~2x larger output raster for BLACK than for WHITE
// -- a real, customer-visible print-resolution inconsistency between
// colorways of the same product/side, not an intentional feature.
//
// This table holds the canonical REFERENCE WIDTH per (product, side) --
// deliberately just a width, not a fixed (width, height) pair -- so
// sharp-renderer.ts can derive a single uniform scale factor
// (referenceWidth / template's own actual width) and apply it to BOTH of
// the template's own actual dimensions. That preserves whatever aspect
// ratio the loaded template actually has (this file is not the place that
// decides aspect ratio -- see getTemplateAspectRatio above) while still
// normalizing absolute resolution across colors: every (product, side) pair
// other than FITTED/front is already naturally consistent across colors
// (OVERSIZED front: 1254x1254 both colors; both BACK templates: 1024x1536
// both colors), so those simply get scale=1 (no-op) using their own already-
// correct width as the reference. FITTED front's reference is 1254 (the
// WHITE/majority resolution), so the higher-res BLACK asset (width 2480)
// gets downscaled by ~0.506x to match -- rather than upscaling WHITE to
// match BLACK, which would just synthesize detail that was never there.
const TEMPLATE_REFERENCE_WIDTH: Record<ProductType, Record<GarmentSide, number>> = {
  FITTED: { front: 1254, back: 1024 },
  OVERSIZED: { front: 1254, back: 1024 },
  CUSTOM: { front: 1254, back: 1024 },
};

export function getTemplateReferenceWidth(product: ProductType, side: GarmentSide): number {
  return TEMPLATE_REFERENCE_WIDTH[product]?.[side] ?? TEMPLATE_REFERENCE_WIDTH.FITTED[side];
}
