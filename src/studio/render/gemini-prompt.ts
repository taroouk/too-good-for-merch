// file: src/studio/render/gemini-prompt.ts
//
// Pure prompt-text builder for the Gemini "blank garment" re-render request
// (used by app/api/mockups/nanobanana/route.ts). Extracted out of the route
// file so it has zero server-only imports (no sharp, no prisma runtime, no
// next-auth) and can be unit-tested by the same plain-tsc/node harness as
// the rest of this module -- see __tests__/gemini-prompt.test.ts. The
// `PlacementType` import below is type-only (erased at compile time, same
// as placement-config.ts's own imports) so this stays true.
import type { PlacementType } from "@prisma/client";
import { getPlacementSide } from "./placement-config";

function labelFromEnum(value: string | null, fallback: string) {
  if (!value) return fallback;
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

// The COMPOSITION LOCK section exists because repeated-generation testing
// (scripts/investigate-geometry.mjs) proved the prior prompt -- which said
// nothing about framing -- let Gemini freely reinterpret the shot:
// identical inputs came back as an on-model photo in one run and a
// flat-lay/ghost-mannequin shot (no person at all) in the next, or with the
// camera zoomed to a different distance. remapResolvedPlacementToGarmentBBox
// (transform.ts) can correct for a crop/zoom change WITHIN one composition,
// but an on-model <-> flat-lay swap is a different coordinate system
// entirely (the detected "subject" bbox means "the whole person" in one and
// "just the garment" in the other) -- no bbox remap can paper over that, so
// it has to be prevented at the source. This prompt is now the primary
// defense; the garment-relative remap remains a secondary safety layer for
// whatever crop/zoom drift still gets through.
export function blankGarmentPrompt({
  product,
  color,
  placement,
}: {
  product: string | null;
  color: string | null;
  placement: string;
}): string {
  const productLabel = labelFromEnum(product, "T-shirt");
  const colorLabel = labelFromEnum(color, "White");
  // Canonical side lookup (placement-config.ts's getPlacementSide), not a
  // second, independent ".includes(\"BACK\")" inference -- both happened to
  // agree today only by coincidence of every *_BACK key genuinely being a
  // back placement. Guarded to "front" for anything getPlacementSide
  // doesn't recognize, matching the old fallback's behavior exactly.
  const view = getPlacementSide(placement as PlacementType) === "back" ? "back" : "front";

  return `
CRITICAL INSTRUCTIONS - READ CAREFULLY. YOU ARE A PHOTOREALISTIC GARMENT PHOTOGRAPHY ENGINE, NOT A CREATIVE DESIGNER.

TASK: This is a photorealism EDIT of the exact input image, not a new photoshoot. Re-render the input image to look like a real photograph while keeping the shot itself -- the subject, the pose, the camera distance and angle, the crop, the framing -- identical to the input. You are enhancing realism in place, not recomposing a new picture.

YOU ARE GIVEN ONE INPUT IMAGE:

INPUT 1 - CLEAN GARMENT REFERENCE:
A clean render of a ${colorLabel} ${productLabel} (${view} view), with no artwork, logo, or print on it. This defines the garment's exact type and color, AND the exact shot (composition, framing, camera angle) that your output must match.

YOUR TASK:
Produce a photorealistic version of this EXACT image:
- Preserve the garment type (${productLabel}).
- Preserve the garment color (${colorLabel}).
- Preserve the garment's structure and silhouette.
- Render realistic fabric texture.
- Render realistic folds and wrinkles.
- Render realistic, natural lighting and shadows.
- Produce a clean, photorealistic, completely BLANK garment.

COMPOSITION LOCK -- treat every point below as equally critical as the garment itself:
- If the input image shows the garment worn by a person, the output MUST also show it worn by a person, in the same pose, facing the same direction, hands in the same position. Do NOT remove the person. Do NOT switch to a flat-lay, ghost-mannequin, or product-only shot.
- If a person is present: preserve their exact identity, face, facial features, expression, skin tone, hair color, hair style, and body shape pixel-for-pixel unchanged. You are ONLY allowed to enhance the garment's fabric realism (texture, folds, wrinkles, lighting/shadow on the fabric itself). Do NOT regenerate, restyle, beautify, or in any way alter the person -- treat everything that is not the garment fabric as fixed, untouchable reference material to render around exactly as given.
- If the input image has no person (flat-lay/ghost-mannequin), the output MUST also have no person.
- Match the input image's camera framing and crop exactly -- do not zoom in, zoom out, crop tighter, crop wider, or reframe. The garment must occupy the same position and the same proportion of the frame as in the input image.
- Match the input image's camera angle exactly (the same eye-level, straight-on perspective -- not a different angle).
- Match the input image's aspect ratio.
- Do not add a background, backdrop, floor, or scene beyond what the input image already implies.

STRICT PROHIBITIONS - ANY VIOLATION INVALIDATES THE OUTPUT:
1. Do NOT add any logo, artwork, graphic, or print of any kind.
2. Do NOT add any text, lettering, or typography.
3. Do NOT invent or hallucinate any graphics, patterns, or decoration.
4. Do NOT change the garment type, color, or silhouette.
5. Do NOT substitute a different garment.
6. Do NOT change the composition, framing, crop, camera angle, or aspect ratio -- see COMPOSITION LOCK above.
7. Do NOT change whether the garment is shown on a person versus as a flat/ghost-mannequin shot.
8. The output must be a completely blank, unprinted garment -- realism only, no design of any kind.

Garment context:
- ${colorLabel} ${productLabel}
- ${view} view
`.trim();
}

// Percentages describing where the artwork must be printed, relative to the
// GARMENT CROP image Gemini actually receives as INPUT 1 (not the full
// template) -- i.e. (resolvedPlacement.left - templateGarmentBBox.left) /
// templateGarmentBBox.width, and the equivalent for top/width/height. The
// caller (route.ts) is responsible for that conversion; this function only
// turns the numbers into prose.
export type ArtworkPlacementBox = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  rotationDeg: number;
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// Unlike blankGarmentPrompt (which exists specifically to keep Gemini from
// touching anything but fabric realism), this prompt's whole point is to
// have Gemini ITSELF render the artwork as a real, physically printed
// graphic -- ink sitting in the weave of the fabric, following its folds,
// wrinkles, and the garment's own lighting/shadow -- rather than a flat
// rectangle pasted on top with no interaction with the fabric underneath it
// (which is what the deterministic Sharp compositor in composite.ts
// produces, and exactly the "doesn't look really printed" complaint this
// prompt exists to fix). This trades the Sharp path's pixel-exact placement
// guarantee for Gemini's own placement judgement -- the box/rotation below
// are given as strong, specific guidance, not a hard constraint Gemini is
// mechanically capable of obeying to the pixel, unlike compositeArtworkOntoBase.
export function printedArtworkPrompt({
  product,
  color,
  placement,
  box,
}: {
  product: string | null;
  color: string | null;
  placement: string;
  box: ArtworkPlacementBox;
}): string {
  const productLabel = labelFromEnum(product, "T-shirt");
  const colorLabel = labelFromEnum(color, "White");
  const view = getPlacementSide(placement as PlacementType) === "back" ? "back" : "front";
  const rotationNote =
    Math.abs(box.rotationDeg) < 0.5
      ? "upright, with no rotation"
      : `rotated ${Math.abs(box.rotationDeg).toFixed(1)} degrees ${box.rotationDeg > 0 ? "clockwise" : "counter-clockwise"} from upright`;

  return `
CRITICAL INSTRUCTIONS - READ CAREFULLY. YOU ARE A PHOTOREALISTIC GARMENT PRINTING ENGINE, NOT A CREATIVE DESIGNER.

TASK: This is a photorealism EDIT of the exact input image, not a new photoshoot. You are given TWO input images. Re-render INPUT 1 to look like a real photograph of the SAME garment, now with INPUT 2 printed onto its fabric exactly as described below -- keeping the shot itself (subject, pose, camera distance/angle, crop, framing) identical to INPUT 1.

YOU ARE GIVEN TWO INPUT IMAGES:

INPUT 1 - GARMENT REFERENCE:
A clean render of a ${colorLabel} ${productLabel} (${view} view), with no artwork, logo, or print on it. This defines the garment's exact type, color, and the exact shot (composition, framing, camera angle) that your output must match.

INPUT 2 - ARTWORK TO PRINT:
The exact graphic/logo/image that must be printed onto the garment. Reproduce its content, shape, and colors EXACTLY as given -- do not redraw, restyle, recolor, simplify, or reinterpret it in any way. Treat it as a fixed design file being manufactured, not creative inspiration.

PRINT PLACEMENT (on the garment shown in INPUT 1):
- Horizontal position: the artwork's left edge starts at ${pct(box.leftPct)} of the garment image's width, and the artwork spans ${pct(box.widthPct)} of the garment image's width.
- Vertical position: the artwork's top edge starts at ${pct(box.topPct)} of the garment image's height, and the artwork spans ${pct(box.heightPct)} of the garment image's height.
- Orientation: ${rotationNote}.
- These are measured against the FULL garment image frame (0% = left/top edge of the image, 100% = right/bottom edge), not against the shirt's own edges.

YOUR TASK:
Produce a photorealistic version of INPUT 1 with INPUT 2 printed at the position described above, as if it were REALLY manufactured onto this garment:
- Preserve the garment type (${productLabel}), color (${colorLabel}), structure, and silhouette.
- Render realistic fabric texture, folds, wrinkles, and natural lighting/shadow -- on both the blank fabric AND the printed area.
- The print must look physically embedded in the fabric: it should follow the same folds/wrinkles/curvature as the garment surface beneath it, catch the same lighting and cast/receive the same soft shadows as the fabric around it, and show the fabric's own texture subtly showing through the ink (like a real screen-print or DTG print), NOT a flat sticker floating on top with sharp, perfectly rectangular edges and no interaction with the garment's lighting or folds.
- Do not let the print distort the artwork's own aspect ratio, content, or colors -- only its perspective/shading should change to match sitting on a real, three-dimensional garment surface.

COMPOSITION LOCK -- treat every point below as equally critical as the garment itself:
- If INPUT 1 shows the garment worn by a person, the output MUST also show it worn by a person, in the same pose, facing the same direction, hands in the same position. Do NOT remove the person. Do NOT switch to a flat-lay, ghost-mannequin, or product-only shot.
- If a person is present: preserve their exact identity, face, facial features, expression, skin tone, hair color, hair style, and body shape pixel-for-pixel unchanged. You are ONLY allowed to render the garment's fabric realism and the printed artwork -- do NOT regenerate, restyle, beautify, or in any way alter the person.
- If INPUT 1 has no person (flat-lay/ghost-mannequin), the output MUST also have no person.
- Match INPUT 1's camera framing and crop exactly -- do not zoom in, zoom out, crop tighter, crop wider, or reframe.
- Match INPUT 1's camera angle and aspect ratio exactly.
- Do not add a background, backdrop, floor, or scene beyond what INPUT 1 already implies.
- CRITICAL: your output image's width-to-height ratio (aspect ratio) and pixel dimensions MUST be IDENTICAL to INPUT 1's. INPUT 2 (the artwork) is a separate reference image ONLY for its content/colors -- its own shape, size, or aspect ratio must NEVER influence the output canvas's shape in any way. Never crop, pad, letterbox, or resize the output canvas to accommodate INPUT 2 or to fit the print placement -- the print always resizes to fit the garment, the canvas never resizes to fit the print.

STRICT PROHIBITIONS - ANY VIOLATION INVALIDATES THE OUTPUT:
1. Do NOT add any logo, artwork, graphic, print, or text other than INPUT 2, placed exactly as described above.
2. Do NOT redraw, restyle, recolor, or reinterpret INPUT 2's actual design.
3. Do NOT change the garment type, color, or silhouette.
4. Do NOT substitute a different garment.
5. Do NOT change the composition, framing, crop, camera angle, or aspect ratio -- see COMPOSITION LOCK above.
6. Do NOT change whether the garment is shown on a person versus as a flat/ghost-mannequin shot.

Garment context:
- ${colorLabel} ${productLabel}
- ${view} view
`.trim();
}
