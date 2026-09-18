// file: src/studio/render/placement-config.ts
//
// Single source of truth for placement geometry, shared by the server
// compositor (sharp-renderer.ts) and, eventually, the client preview.
// No server-only imports (no `sharp`, no `node:fs`) so this module stays
// safe to import from client components.
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import type { GarmentSide, PlacementBox, TemplateRef } from "./types";
import { RendererError } from "./errors";

// Re-measured directly against the CURRENT real template photos
// (public/images/TGFM White*.png, public/images/Oversized White*.png --
// these files were replaced mid-project with new, differently-framed
// photos; see getTemplateAspectRatio's own comment) by compositing each box
// as a translucent rectangle onto the real template and visually checking
// it lands on the model's actual shirt, iterating with a percent-gridline
// overlay for precision. The previous values here were calibrated against
// the OLD (now-replaced) template files and no longer lined up with the
// new photos at all -- CENTER_BACK/FULL_BACK in particular were landing on
// the model's hair, and LEFT_CHEST/RIGHT_CHEST overlapped each other and
// sat on the collar instead of chest-pocket height.
const FITTED_BOXES: Record<PlacementType, PlacementBox> = {
  CENTER_FRONT: { xPct: 0.34, yPct: 0.4, widthPct: 0.32 },
  FULL_FRONT: { xPct: 0.2, yPct: 0.36, widthPct: 0.6 },
  LEFT_CHEST: { xPct: 0.3, yPct: 0.38, widthPct: 0.14 },
  RIGHT_CHEST: { xPct: 0.56, yPct: 0.38, widthPct: 0.14 },
  // BACK boxes below are calibrated separately from FRONT -- the back
  // template has different photo framing than the front template, so
  // identical (xPct, yPct) values do NOT land on the same physical body
  // location.
  CENTER_BACK: { xPct: 0.34, yPct: 0.38, widthPct: 0.32 },
  FULL_BACK: { xPct: 0.2, yPct: 0.34, widthPct: 0.6 },
  LEFT_SLEEVE: { xPct: 0.06, yPct: 0.34, widthPct: 0.12 },
  RIGHT_SLEEVE: { xPct: 0.82, yPct: 0.34, widthPct: 0.12 },
};

// See the FITTED_BOXES comment above -- same re-measurement, checked against
// the current Oversized White/Black.png and Oversized White/Black Back.png.
const OVERSIZED_BOXES: Record<PlacementType, PlacementBox> = {
  CENTER_FRONT: { xPct: 0.33, yPct: 0.4, widthPct: 0.34 },
  FULL_FRONT: { xPct: 0.18, yPct: 0.36, widthPct: 0.64 },
  LEFT_CHEST: { xPct: 0.3, yPct: 0.38, widthPct: 0.15 },
  RIGHT_CHEST: { xPct: 0.55, yPct: 0.38, widthPct: 0.15 },
  CENTER_BACK: { xPct: 0.33, yPct: 0.38, widthPct: 0.34 },
  FULL_BACK: { xPct: 0.18, yPct: 0.34, widthPct: 0.64 },
  LEFT_SLEEVE: { xPct: 0.02, yPct: 0.36, widthPct: 0.14 },
  RIGHT_SLEEVE: { xPct: 0.84, yPct: 0.36, widthPct: 0.14 },
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

// Real measured pixel dimensions of the CURRENT template files (verified via
// `sharp(...).metadata()` against every file in TEMPLATE_FILES, 2026-09-18):
// TGFM White.png 581x1185, TGFM Black.png 1118x2353, TGFM White Back.png
// 689x1345, TGFM Black Back.png 683x1439, Oversized White.png 619x1197,
// Oversized Black.png 646x1205, Oversized White Back.png 666x1213, Oversized
// Black Back.png 716x1310. Unlike the previous generation of these assets,
// NEITHER side is a clean square or a shared exact ratio across colors any
// more -- every one of the 8 files is its own individual tightly-cropped
// photo, front and back both landing in the ~0.47-0.55 (width/height) range.
// This constant is only ever a FALLBACK now: the client preview measures
// each image's real aspect ratio itself once it loads (see
// useImageAspectRatio.ts) rather than trusting a single hardcoded per-side
// value, precisely because these values go stale the moment the underlying
// photos are swapped for a different framing/crop -- exactly what happened
// here. resolvePlacement()'s own math is unaffected either way, since it
// always reads each template's actual width/height via sharp().metadata().
// Values below use the WHITE file of each side as the representative ratio
// (same convention as TEMPLATE_REFERENCE_WIDTH below).
const TEMPLATE_ASPECT_RATIO: Record<GarmentSide, number> = {
  front: 581 / 1185,
  back: 689 / 1345,
};

export function getTemplateAspectRatio(side: GarmentSide): number {
  return TEMPLATE_ASPECT_RATIO[side];
}

// P3-21k: TGFM Black.png (FITTED/BLACK/front) has never had the same native
// resolution as TGFM White.png -- sharp-renderer.ts sizes its final output
// off a canonical per-(product,side) reference width rather than each
// template's own raw metadata, so an otherwise-identical mockup request
// (same product/placement/transform/artwork/dpi) doesn't produce a
// different-sized output raster purely because one color's source photo
// happens to be a higher-resolution export than the other.
//
// This table holds the canonical REFERENCE WIDTH per (product, side) --
// deliberately just a width, not a fixed (width, height) pair -- so
// sharp-renderer.ts can derive a single uniform scale factor
// (referenceWidth / template's own actual width) and apply it to BOTH of
// the template's own actual dimensions. That preserves whatever aspect
// ratio the loaded template actually has (this file is not the place that
// decides aspect ratio -- see getTemplateAspectRatio above) while still
// normalizing absolute resolution across colors. Unlike the previous
// generation of assets, BLACK and WHITE now have genuinely different native
// aspect ratios (not just different resolutions of the same framing), so
// normalizing width no longer implies identical output height across
// colors any more -- see template-resolution-parity.test.ts's own updated
// assertions. Values below use each side's WHITE file width as the
// reference (arbitrary but consistent choice, matching the previous
// generation's convention of using the majority/lower-resolution file).
const TEMPLATE_REFERENCE_WIDTH: Record<ProductType, Record<GarmentSide, number>> = {
  FITTED: { front: 581, back: 689 },
  OVERSIZED: { front: 619, back: 666 },
  CUSTOM: { front: 581, back: 689 },
};

export function getTemplateReferenceWidth(product: ProductType, side: GarmentSide): number {
  return TEMPLATE_REFERENCE_WIDTH[product]?.[side] ?? TEMPLATE_REFERENCE_WIDTH.FITTED[side];
}

// The rectangle (top-left anchored, template-relative fractions) the
// artwork's own bounding box must stay inside while being dragged -- NOT
// the full canvas. These template photos are tightly, edge-to-edge cropped
// (no background border to detect a garment silhouette against, unlike a
// studio product-only shot), so the "canvas" already includes the model's
// head, hair, arms and legs well beyond the shirt itself. getDragBounds
// used to clamp only to the full [0,1] canvas, which let the user drag
// artwork up onto the face/hair or down onto the jeans -- outside the
// t-shirt entirely. These values are an eyeballed approximation of where
// the shirt actually sits in each of the 8 real template photos (roughly:
// collar/shoulder line down to the hem above the waistband, inset a bit
// from the outer arm/sleeve edges) -- re-check visually against the actual
// files if they're ever replaced again, the same way TEMPLATE_ASPECT_RATIO
// above needs to be.
const GARMENT_SAFE_AREA: Record<GarmentSide, PlacementBox & { heightPct: number }> = {
  front: { xPct: 0.06, yPct: 0.26, widthPct: 0.88, heightPct: 0.54 },
  back: { xPct: 0.06, yPct: 0.26, widthPct: 0.88, heightPct: 0.52 },
};

export function getGarmentSafeArea(side: GarmentSide): PlacementBox & { heightPct: number } {
  return GARMENT_SAFE_AREA[side];
}
