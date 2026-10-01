// file: src/studio/render/editor-surface.ts
//
// The Bespoke popup's EDITOR SURFACE: the flat, laid-out t-shirt the
// customer actually designs on (public/images/"front -tshirt 1.png" and
// "t-shirt back 1.png"), as opposed to the photographed-model TEMPLATES
// (placement-config.ts's TEMPLATE_FILES) that the outer Live Model
// Preview, the deterministic Print Mockup and the Gemini AI mockup are all
// rendered against.
//
// WHY THIS EXISTS -- the two surfaces are geometrically unrelated. A model
// photo is a tightly-cropped head-to-thigh shot in which the garment
// occupies roughly the middle ~60% of the width and ~50% of the height; a
// flat tee fills nearly its whole canvas. So the SAME artwork transform
// cannot be interpreted against both: a placement box or drag offset
// expressed as a fraction of the model photo's canvas lands somewhere
// completely different on the flat tee's canvas (and vice versa).
//
// WHAT IS CANONICAL -- nothing here is. The stored/persisted artwork
// transform stays in TEMPLATE space exactly as before (BuildDraft
// .artworkPlacement, /api/mockups/print, /api/mockups/nanobanana,
// resolvePlacement, TryOn3DPreview), so the server compositor, every
// existing tuned placement box and every geometry test are untouched by
// this module. This is purely a DISPLAY-SIDE bijection applied at the
// popup's edge: template space -> editor space to draw, editor space ->
// template space to record a drag. That is what makes "what I built in the
// popup is exactly what the model outside is wearing" true by construction
// rather than by a second hand-tuned coordinate table that could drift.
//
// HOW THE MAPPING WORKS -- both surfaces declare a GARMENT FRAME: the
// rectangle the shirt's TORSO occupies in that image (shoulder/collar line
// down to the hem, body side seam to body side seam -- deliberately NOT
// including the sleeves, which are the one part of the garment whose
// relative width differs wildly between a flat lay and a worn photo).
// Artwork geometry is converted through those two frames, so a print that
// sits, say, 24% in from the left body seam and 20% down from the shoulder
// line on the flat tee sits at exactly the same place on the body in the
// model photo.
//
// Zero server-only imports (no node:fs, no sharp) -- safe to import
// directly from a client component, same as placement-css.ts and
// bespoke-shirt-image.ts. Deliberately NOT re-exported from ./index.ts
// (that barrel also re-exports templates.ts, which does node:fs I/O).
import type { CSSProperties } from "react";
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import {
  getGarmentSafeArea,
  getPlacementBox,
  getPlacementSide,
  getTemplateTorsoFrame,
  type GarmentFrame,
} from "./placement-config";

export type { GarmentFrame } from "./placement-config";
import { placementBoxToStyle } from "./placement-css";
import type { GarmentSide, PlacementBox } from "./types";

const EDITOR_FILES: Record<GarmentSide, string> = {
  front: "front -tshirt 1.png",
  back: "t-shirt back 1.png",
};

// Real pixel dimensions, read off the files themselves with sharp. Used as
// the FALLBACK canvas aspect ratio before the <img> has loaded (the popup
// measures the displayed image's own naturalWidth/naturalHeight once it
// has -- see useImageAspectRatio) and, unlike that fallback, as a genuine
// input to the vertical part of the frame remap below, which needs to
// convert between "fraction of canvas width" and "fraction of canvas
// height" units on each surface.
const EDITOR_PIXEL_SIZE: Record<GarmentSide, { width: number; height: number }> = {
  front: { width: 1211, height: 1106 },
  back: { width: 1159, height: 1054 },
};

// Measured directly off the two flat-tee PNGs by scanning each alpha row
// for the garment's horizontal extent (`node scripts/measure-garment-
// frames.mjs rows`): below the sleeve hem the body sits at a dead-constant
// x = 259..960 of 1211 (front) and 249..915 of 1159 (back), and the
// garment's own alpha bounding box gives the shoulder line and the hem.
// Re-measure the same way if these two files are ever replaced.
const EDITOR_FRAMES: Record<GarmentSide, GarmentFrame> = {
  front: { xPct: 0.214, yPct: 0.02, widthPct: 0.579, heightPct: 0.954 },
  back: { xPct: 0.215, yPct: 0.008, widthPct: 0.574, heightPct: 0.967 },
};

// Per-file width/height of the model photos, as verified with
// sharp().metadata() (the same measurement placement-config.ts's own
// dimensions comment records). Needed for the same width-vs-height unit
// conversion EDITOR_PIXEL_SIZE is needed for -- getTemplateAspectRatio()
// is deliberately NOT used here: it collapses all four files of a side
// onto the WHITE one's ratio, which is accurate enough for a pre-load
// layout fallback but not for a coordinate transform that has to agree
// with the real rendered geometry.
const TEMPLATE_ASPECTS: Record<ProductType, Record<GarmentColor, Record<GarmentSide, number>>> = {
  FITTED: {
    WHITE: { front: 581 / 1185, back: 689 / 1345 },
    BLACK: { front: 1118 / 2353, back: 683 / 1439 },
    CUSTOM: { front: 581 / 1185, back: 689 / 1345 },
  },
  OVERSIZED: {
    WHITE: { front: 619 / 1197, back: 666 / 1213 },
    BLACK: { front: 646 / 1205, back: 716 / 1310 },
    CUSTOM: { front: 619 / 1197, back: 666 / 1213 },
  },
  CUSTOM: {
    WHITE: { front: 581 / 1185, back: 689 / 1345 },
    BLACK: { front: 1118 / 2353, back: 683 / 1439 },
    CUSTOM: { front: 581 / 1185, back: 689 / 1345 },
  },
};

// The popup only ever previews against a concrete FITTED/OVERSIZED +
// BLACK/WHITE template -- same fallback resolveMockupProduct /
// resolveMockupColor (BuilderClient.tsx) and getBespokeShirtImage already
// use for Bespoke ("CUSTOM"), kept identical here on purpose so the
// editor's geometry can never be remapped against a different template
// than the one actually rendered.
function resolveProduct(product: string | null | undefined): ProductType {
  return product === "OVERSIZED" ? "OVERSIZED" : "FITTED";
}

function resolveColor(color: string | null | undefined): GarmentColor {
  return color === "BLACK" ? "BLACK" : "WHITE";
}

export function getEditorTemplateSrc(placement: PlacementType): string {
  return `/images/${EDITOR_FILES[getPlacementSide(placement)]}`;
}

export function getEditorAspectRatio(side: GarmentSide): number {
  const { width, height } = EDITOR_PIXEL_SIZE[side];
  return width / height;
}

export function getEditorGarmentFrame(side: GarmentSide): GarmentFrame {
  return EDITOR_FRAMES[side];
}

export function getTemplateGarmentFrame(
  product: string | null | undefined,
  color: string | null | undefined,
  side: GarmentSide,
): GarmentFrame {
  return getTemplateTorsoFrame(resolveProduct(product), resolveColor(color), side);
}

function getTemplateAspect(
  product: string | null | undefined,
  color: string | null | undefined,
  side: GarmentSide,
): number {
  return TEMPLATE_ASPECTS[resolveProduct(product)][resolveColor(color)][side];
}

// x and y offsets are both fractions of their own canvas's WIDTH (see
// artworkOffsetPx in transform.ts). Converting one to the other therefore
// needs two different factors:
//
//   x: the frames' widths are already in canvas-width units, so the ratio
//      of frame widths is the whole conversion.
//   y: the frames' heights are in canvas-HEIGHT units, so the ratio of
//      frame heights must additionally be re-expressed in width units,
//      which is what the aspect-ratio factor does.
//
// Returned as a pair of multipliers (rather than applied inline) because
// the popup needs them in both directions: forward to draw the stored
// transform, inverse to turn a drag's pixel delta back into a stored
// template-space transform.
function offsetScaleFactors(
  product: string | null | undefined,
  color: string | null | undefined,
  side: GarmentSide,
): { x: number; y: number } {
  const editorFrame = EDITOR_FRAMES[side];
  const templateFrame = getTemplateGarmentFrame(product, color, side);
  const editorAspect = getEditorAspectRatio(side);
  const templateAspect = getTemplateAspect(product, color, side);
  return {
    x: editorFrame.widthPct / templateFrame.widthPct,
    y: (editorFrame.heightPct / templateFrame.heightPct) * (templateAspect / editorAspect),
  };
}

// The canonical, template-space placement box (placement-config.ts --
// still the single source of truth for WHERE a placement sits on the
// garment) expressed in the flat tee's own canvas fractions, so the popup
// can lay the artwork overlay out over the flat tee without a second
// hand-tuned per-placement table.
export function getEditorPlacementBox(
  product: string | null | undefined,
  color: string | null | undefined,
  placement: PlacementType,
): PlacementBox {
  const side = getPlacementSide(placement);
  const editorFrame = EDITOR_FRAMES[side];
  const templateFrame = getTemplateGarmentFrame(product, color, side);
  const box = getPlacementBox(resolveProduct(product), resolveColor(color), placement);

  const widthRatio = editorFrame.widthPct / templateFrame.widthPct;
  const heightRatio = editorFrame.heightPct / templateFrame.heightPct;

  return {
    xPct: editorFrame.xPct + ((box.xPct - templateFrame.xPct) / templateFrame.widthPct) * editorFrame.widthPct,
    yPct: editorFrame.yPct + ((box.yPct - templateFrame.yPct) / templateFrame.heightPct) * editorFrame.heightPct,
    widthPct: box.widthPct * widthRatio,
    ...(box.heightPct == null ? {} : { heightPct: box.heightPct * heightRatio }),
  };
}

export function getEditorPlacementStyle(
  product: string | null | undefined,
  color: string | null | undefined,
  placement: PlacementType,
): CSSProperties {
  return placementBoxToStyle(getEditorPlacementBox(product, color, placement));
}

// A stored (template-space) drag offset, expressed in the flat tee's own
// canvas-width units so the popup's CSS translate() puts the artwork on
// the same spot of the garment the model outside will be wearing.
export function toEditorOffset(
  transform: { x: number; y: number },
  product: string | null | undefined,
  color: string | null | undefined,
  placement: PlacementType,
): { x: number; y: number } {
  const factors = offsetScaleFactors(product, color, getPlacementSide(placement));
  return { x: transform.x * factors.x, y: transform.y * factors.y };
}

// The exact inverse of toEditorOffset: a drag measured against the flat
// tee's canvas, converted back into the template-space transform that is
// what actually gets clamped (getDragBounds), persisted and rendered.
// Nothing downstream of the popup ever sees editor-space numbers.
export function toTemplateOffset(
  offset: { x: number; y: number },
  product: string | null | undefined,
  color: string | null | undefined,
  placement: PlacementType,
): { x: number; y: number } {
  const factors = offsetScaleFactors(product, color, getPlacementSide(placement));
  return { x: offset.x / factors.x, y: offset.y / factors.y };
}

// The template-space drag safe area (placement-config.ts's
// GARMENT_SAFE_AREA -- "where the shirt actually is in the model photo")
// expressed in flat-tee canvas fractions. Not used for clamping (that
// stays in template space, in getDragBounds, unchanged); exported so a
// caller can draw/debug the editor's own draggable region without
// re-deriving the frame math.
export function getEditorSafeArea(
  product: string | null | undefined,
  color: string | null | undefined,
  side: GarmentSide,
): GarmentFrame {
  const editorFrame = EDITOR_FRAMES[side];
  const templateFrame = getTemplateGarmentFrame(product, color, side);
  const safe = getGarmentSafeArea(side);
  return {
    xPct: editorFrame.xPct + ((safe.xPct - templateFrame.xPct) / templateFrame.widthPct) * editorFrame.widthPct,
    yPct: editorFrame.yPct + ((safe.yPct - templateFrame.yPct) / templateFrame.heightPct) * editorFrame.heightPct,
    widthPct: (safe.widthPct / templateFrame.widthPct) * editorFrame.widthPct,
    heightPct: (safe.heightPct / templateFrame.heightPct) * editorFrame.heightPct,
  };
}
