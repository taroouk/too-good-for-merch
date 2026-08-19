// file: src/studio/render/transform.ts
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import { RendererError } from "./errors";
import { getPlacementBox } from "./placement-config";
import type { ArtworkTransform, GarmentBBox, PlacementBox, ResolvedPlacement } from "./types";

// x/y are fractions of the placement container's own width/height (see
// resolvePlacement below), not raw pixels -- resolution-independent, so the
// same value means the same relative offset on any container size, client
// or server. Bounds are generous (well beyond the visible canvas in either
// direction); MAX_ABSOLUTE_COVERAGE_FRACTION below is the real safety net
// on the resolved result.
export const TRANSFORM_BOUNDS = {
  x: { min: -3, max: 3 },
  y: { min: -3, max: 3 },
  scale: { min: 0.4, max: 2.4 },
  rotation: { min: -180, max: 180 },
} as const;

// A placement's resolved width must never exceed this fraction of the
// template's width, regardless of user-chosen scale. Without this, the
// flat TRANSFORM_BOUNDS.scale.max applied uniformly to placements whose
// base widthPct varies 5x (0.05 for chest/sleeve vs 0.36 for the largest
// bespoke "full" placements) lets FULL_FRONT/FULL_BACK resolve to 60%+ of
// the entire canvas at legitimate, in-UI-bounds scale values -- see
// getEffectiveScaleBounds. Small placements are unaffected (their
// unrestricted ceiling stays far above TRANSFORM_BOUNDS.scale.max).
export const MAX_PLACEMENT_WIDTH_FRACTION = 0.45;

// Independent defensive backstop, not the fix itself: even with a correct
// per-placement scale ceiling, an artwork with an extreme aspect ratio
// (e.g. a very tall/narrow banner) can still resolve to an oversized
// height. If either resolved dimension would exceed this fraction of the
// template, resolvePlacement rejects the request outright rather than
// silently reshaping it.
export const MAX_ABSOLUTE_COVERAGE_FRACTION = 0.95;

// There is no established real-world print size per garment template in
// this codebase (no "this template = N x M inches" spec anywhere), so DPI
// is treated as a scale factor relative to this baseline rather than a
// literal dots-per-inch conversion: output pixels = native template pixels
// * (dpi / BASELINE_RENDER_DPI). A dpi equal to the baseline renders at the
// template's native resolution.
export const BASELINE_RENDER_DPI = 150;

function clamp(value: number, bounds: { min: number; max: number }) {
  return Math.max(bounds.min, Math.min(bounds.max, value));
}

// The maximum scale a placement can use without its resolved width
// exceeding MAX_PLACEMENT_WIDTH_FRACTION of the template. Shared by the
// server (resolvePlacement) and the client (the zoom control's clamp), so
// the UI can never let a user pick a scale the server would render
// differently. Small placements (chest/sleeve) are effectively
// unrestricted -- their ceiling stays far above TRANSFORM_BOUNDS.scale.max.
export function getEffectiveScaleBounds(
  product: ProductType,
  color: GarmentColor,
  placement: PlacementType,
): { min: number; max: number } {
  const box = getPlacementBox(product, color, placement);
  const placementMax =
    box.widthPct > 0 ? MAX_PLACEMENT_WIDTH_FRACTION / box.widthPct : TRANSFORM_BOUNDS.scale.max;
  return {
    min: TRANSFORM_BOUNDS.scale.min,
    max: Math.min(TRANSFORM_BOUNDS.scale.max, placementMax),
  };
}

// Scales a box around its own center and returns the resulting top-left
// corner + dimensions -- the same semantics as CSS
// `transform: translate(x, y) scale(s)` applied to an element originally
// laid out at (left0, top0, width0, height0) with the default
// transform-origin (50% 50%): the box grows/shrinks around its center,
// THEN the flat pixel offset is applied. This must match the client
// exactly, since the client's live preview and the server's render both
// need to agree on where a given (x, y, scale) puts the artwork.
function scaleBoxAroundCenter(
  box: { left: number; top: number; width: number; height: number },
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  const width = box.width * scale;
  const height = box.height * scale;
  return {
    left: centerX - width / 2 + offsetX,
    top: centerY - height / 2 + offsetY,
    width,
    height,
  };
}

export function validateTransform(transform: ArtworkTransform): void {
  const { x, y, scale, rotation = 0 } = transform;
  for (const [key, value] of Object.entries({ x, y, scale, rotation })) {
    if (!Number.isFinite(value)) {
      throw new RendererError(`Artwork transform field "${key}" must be a finite number.`, 400);
    }
  }
  if (scale < TRANSFORM_BOUNDS.scale.min || scale > TRANSFORM_BOUNDS.scale.max) {
    throw new RendererError(
      `Artwork scale must be between ${TRANSFORM_BOUNDS.scale.min} and ${TRANSFORM_BOUNDS.scale.max}.`,
      400,
    );
  }
  if (x < TRANSFORM_BOUNDS.x.min || x > TRANSFORM_BOUNDS.x.max) {
    throw new RendererError("Artwork x offset is out of range.", 400);
  }
  if (y < TRANSFORM_BOUNDS.y.min || y > TRANSFORM_BOUNDS.y.max) {
    throw new RendererError("Artwork y offset is out of range.", 400);
  }
  if (rotation < TRANSFORM_BOUNDS.rotation.min || rotation > TRANSFORM_BOUNDS.rotation.max) {
    throw new RendererError("Artwork rotation is out of range.", 400);
  }
}

export function resolvePlacement(params: {
  product: ProductType;
  color: GarmentColor;
  placement: PlacementType;
  transform: ArtworkTransform;
  templateWidth: number;
  templateHeight: number;
  artworkWidth: number;
  artworkHeight: number;
}): ResolvedPlacement {
  const { product, color, placement, transform, templateWidth, templateHeight, artworkWidth, artworkHeight } = params;
  validateTransform(transform);

  const box: PlacementBox = getPlacementBox(product, color, placement);
  const scale = clamp(transform.scale, getEffectiveScaleBounds(product, color, placement));
  const rotation = clamp(transform.rotation ?? 0, TRANSFORM_BOUNDS.rotation);

  // Unscaled box (scale=1, no offset) -- the same box the client lays out
  // before applying its CSS transform.
  const width0 = box.widthPct * templateWidth;
  const artworkAspect = artworkWidth > 0 && artworkHeight > 0 ? artworkHeight / artworkWidth : 1;
  const height0 = width0 * artworkAspect;
  const left0 = box.xPct * templateWidth;
  const top0 = box.yPct * templateHeight;

  const offsetXPx = transform.x * templateWidth;
  const offsetYPx = transform.y * templateHeight;

  const scaled = scaleBoxAroundCenter(
    { left: left0, top: top0, width: width0, height: height0 },
    scale,
    offsetXPx,
    offsetYPx,
  );

  if (
    scaled.width > templateWidth * MAX_ABSOLUTE_COVERAGE_FRACTION ||
    scaled.height > templateHeight * MAX_ABSOLUTE_COVERAGE_FRACTION
  ) {
    throw new RendererError(
      "This artwork and placement combination would cover almost the entire garment. Try a smaller scale or a different placement.",
      400,
    );
  }

  return {
    left: Math.round(scaled.left),
    top: Math.round(scaled.top),
    width: Math.max(1, Math.round(scaled.width)),
    height: Math.max(1, Math.round(scaled.height)),
    rotation,
  };
}

// Maps a ResolvedPlacement computed against one canvas size (the garment
// template) onto a DIFFERENT canvas size -- specifically, Gemini's actual
// output image, whose dimensions the model does not guarantee will match
// the template it was given (observed empirically: a 1254x1254 template
// can come back as, e.g., 1024x1024). Used only by the AI Mockup
// post-compositor; the deterministic Print Mockup path never calls this
// (its base image IS the template, so no remap is needed there).
//
// Position (left/top) is remapped independently per axis -- it's just
// "where does this box's corner sit" in the target canvas, on the
// assumption that Gemini's output represents the same framing/crop as the
// template, only resized.
//
// Size is deliberately NOT remapped independently per axis: width is
// remapped by the horizontal scale factor, then height is RE-DERIVED from
// the artwork's own aspect ratio (implicit in the input resolved box)
// rather than independently scaled by a possibly-different vertical
// factor. This guarantees the artwork is never stretched/distorted even if
// Gemini's output aspect ratio differs from the template's -- the one
// invariant that must hold unconditionally.
export function remapResolvedPlacement(
  resolved: ResolvedPlacement,
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): ResolvedPlacement {
  const leftFrac = resolved.left / fromWidth;
  const topFrac = resolved.top / fromHeight;
  const widthFrac = resolved.width / fromWidth;
  const artworkAspect = resolved.width > 0 ? resolved.height / resolved.width : 1;

  const width = Math.max(1, Math.round(widthFrac * toWidth));
  const height = Math.max(1, Math.round(width * artworkAspect));

  return {
    left: Math.round(leftFrac * toWidth),
    top: Math.round(topFrac * toHeight),
    width,
    height,
    rotation: resolved.rotation,
  };
}

// Maps a ResolvedPlacement from the template's pixel space onto a target
// image's pixel space using each image's own GARMENT bounding box as the
// anchor, not the full canvas (contrast remapResolvedPlacement above, which
// assumes the garment occupies the same relative position/size in both
// images -- proven false by repeated-generation testing: Gemini can return
// the same output dimensions while framing/cropping/zooming the garment
// completely differently between calls, e.g. a tight fabric-only crop on
// one run and a full head-to-waist model shot on the next). Both bboxes are
// caller-supplied (see garment-bbox.ts's detectGarmentBBox) in their own
// image's pixel space; this function is pure geometry with no image I/O.
//
// Same invariants as remapResolvedPlacement, applied relative to the
// garment bbox instead of the full canvas: position is remapped
// independently per axis (each axis using that axis's own bbox dimension),
// and size is remapped by width only, with height re-derived from the
// artwork's own aspect ratio -- never independently rescaled -- so the
// artwork can never be stretched/distorted even when the template and
// target garment bboxes have different aspect ratios.
export function remapResolvedPlacementToGarmentBBox(
  resolved: ResolvedPlacement,
  fromGarmentBBox: GarmentBBox,
  toGarmentBBox: GarmentBBox,
): ResolvedPlacement {
  const leftFrac = (resolved.left - fromGarmentBBox.left) / fromGarmentBBox.width;
  const topFrac = (resolved.top - fromGarmentBBox.top) / fromGarmentBBox.height;
  const widthFrac = resolved.width / fromGarmentBBox.width;
  const artworkAspect = resolved.width > 0 ? resolved.height / resolved.width : 1;

  const width = Math.max(1, Math.round(widthFrac * toGarmentBBox.width));
  const height = Math.max(1, Math.round(width * artworkAspect));

  return {
    left: Math.round(toGarmentBBox.left + leftFrac * toGarmentBBox.width),
    top: Math.round(toGarmentBBox.top + topFrac * toGarmentBBox.height),
    width,
    height,
    rotation: resolved.rotation,
  };
}
