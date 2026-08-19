// file: src/studio/render/gemini-prompt.ts
//
// Pure prompt-text builder for the Gemini "blank garment" re-render request
// (used by app/api/mockups/nanobanana/route.ts). Extracted out of the route
// file so it has zero server-only imports (no sharp, no prisma, no
// next-auth) and can be unit-tested by the same plain-tsc/node harness as
// the rest of this module -- see __tests__/gemini-prompt.test.ts.
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
  const view = placement.includes("BACK") ? "back" : "front";

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
