// file: src/studio/render/garment-bbox.ts
//
// Detects the photographed garment's own bounding box within an image --
// used to remap artwork placement onto Gemini's output relative to where
// the garment actually is, not relative to the full (mostly empty) canvas.
// See transform.ts's remapResolvedPlacementToGarmentBBox for why: this
// method was validated against 16 real /api/mockups/nanobanana generations
// (scripts/investigate-geometry.mjs) before being wired into production.
import sharp from "sharp";
import { RendererError } from "./errors";
import type { GarmentBBox } from "./types";

export type DetectedGarmentBBox = GarmentBBox & {
  method: "alpha-scan" | "border-flood-fill";
};

// Purely for diagnostic logging (see assertPlausibleBBox) -- never read by
// any detection/threshold logic, so passing or omitting this cannot change
// what gets accepted or rejected.
export type GarmentBBoxLogContext = {
  role: "template" | "gemini-output";
  product?: string | null;
  color?: string | null;
  placement?: string | null;
};

// A detected bbox this small relative to its image is almost certainly a
// detection failure (noisy background defeating trim, or a corrupt/blank
// image), not a real tight crop -- a real garment photo, however zoomed,
// still fills a meaningful fraction of the frame. Guards against feeding a
// degenerate bbox into remapResolvedPlacementToGarmentBBox, which would
// blow the artwork up to an absurd size.
const MIN_BBOX_FRACTION = 0.05;

// A detected bbox touching (near enough) opposite edges of its image on an
// axis is almost certainly ALSO a detection failure, not a real edge-to-
// edge photo: a backstop for whatever the border-flood-fill below doesn't
// already catch (e.g. an image with no discernible background border at
// all). Threshold set from real data: the widest/tallest LEGITIMATE bbox
// seen across 24+ real generations topped out at 98.3%.
const MAX_BBOX_FRACTION = 0.995;

// Below this alpha value a pixel counts as "part of the subject" when
// scanning a genuinely transparent image; above it (see
// TRANSPARENCY_PRESENT_THRESHOLD) a pixel counts as "real transparency" at
// all, distinguishing an actually-transparent template from an opaque
// photo that merely carries an (all-255) alpha channel, e.g. from a prior
// ensureAlpha() call.
const ALPHA_SUBJECT_THRESHOLD = 10;
const ALPHA_TRANSPARENCY_PRESENT_THRESHOLD = 250;

// Max per-channel difference between ADJACENT pixels for them to still
// count as "the same background region" during the border flood fill
// below. Measured from real Gemini output: within a genuine background
// (including a visible lighting vignette/gradient), the largest observed
// pixel-to-pixel step was 4; crossing onto the actual subject (hair,
// garment, a rendering-defect void) jumped by 99+. 16 sits with a wide
// margin on both sides of that gap.
const ADJACENT_STEP_THRESHOLD = 16;

function assertPlausibleBBox(
  bbox: GarmentBBox,
  imageWidth: number,
  imageHeight: number,
  context?: GarmentBBoxLogContext,
): void {
  const widthFrac = bbox.width / imageWidth;
  const heightFrac = bbox.height / imageHeight;

  // Built as a list (rather than one inline boolean) purely so a rejection
  // can report exactly which rule(s) fired -- same truth table as before,
  // not a behavior change.
  const failedRules: string[] = [];
  if (!Number.isFinite(widthFrac) || !Number.isFinite(heightFrac)) failedRules.push("non-finite fraction");
  if (widthFrac < MIN_BBOX_FRACTION) failedRules.push(`widthFrac < MIN_BBOX_FRACTION (${MIN_BBOX_FRACTION})`);
  if (heightFrac < MIN_BBOX_FRACTION) failedRules.push(`heightFrac < MIN_BBOX_FRACTION (${MIN_BBOX_FRACTION})`);
  if (widthFrac > MAX_BBOX_FRACTION) failedRules.push(`widthFrac > MAX_BBOX_FRACTION (${MAX_BBOX_FRACTION})`);
  if (heightFrac > MAX_BBOX_FRACTION) failedRules.push(`heightFrac > MAX_BBOX_FRACTION (${MAX_BBOX_FRACTION})`);

  if (failedRules.length > 0) {
    console.error("detectGarmentBBox: rejected an implausible garment bbox", {
      imageWidth,
      imageHeight,
      bbox,
      leftFrac: bbox.left / imageWidth,
      topFrac: bbox.top / imageHeight,
      widthFrac,
      heightFrac,
      failedRules,
      context: context ?? "not available",
    });
    throw new RendererError(
      "Could not reliably detect the garment in the generated image.",
      500,
    );
  }
}

// Genuinely transparent image (the clean template): scan the alpha channel
// directly for the bbox of non-transparent pixels. Exact -- no
// thresholding/guessing needed, since we control how these templates are
// authored.
//
// One real-world exception found via "TGFM Black Back.png": the entire
// left edge column (x=0, all 1536 rows) carries a faint alpha of ~45-52 (a
// PNG export artifact -- a 1px-wide vertical stripe), while the very next
// column (x=1) is alpha=0 for its whole height. That stripe exceeded
// ALPHA_SUBJECT_THRESHOLD and got counted as "subject", pulling minX to 0
// AND minY to 0 (since the stripe runs the full height, it touches row 0
// too), pushing this template's bbox to heightFrac 1.0000 -- past
// MAX_BBOX_FRACTION -- and failing assertPlausibleBBox on every single
// request for this garment/side, not just occasionally. A 4-connected
// neighbour check alone doesn't catch this: every pixel in that column has
// an above-threshold neighbour directly above/below it in the SAME column.
// What a real subject edge has that a 1px-wide line artifact does not is
// actual 2D extent -- it's a few pixels wide in both axes, not a hairline.
// Requiring at least one DIAGONAL neighbour above threshold as well
// enforces that: the defect column's neighbouring column is uniformly zero,
// so every pixel in it has zero diagonal neighbours above threshold and
// gets excluded, while a genuine (curved, multi-pixel) garment/hair edge
// has diagonal continuity and is unaffected.
function hasAboveThresholdNeighbor(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  x: number,
  y: number,
): boolean {
  const orthogonal: Array<[number, number]> = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
  const diagonal: Array<[number, number]> = [
    [x - 1, y - 1],
    [x + 1, y - 1],
    [x - 1, y + 1],
    [x + 1, y + 1],
  ];

  const above = (nx: number, ny: number) =>
    nx >= 0 && nx < width && ny >= 0 && ny < height && data[(ny * width + nx) * channels + 3] > ALPHA_SUBJECT_THRESHOLD;

  const hasOrthogonal = orthogonal.some(([nx, ny]) => above(nx, ny));
  const hasDiagonal = diagonal.some(([nx, ny]) => above(nx, ny));
  return hasOrthogonal && hasDiagonal;
}

// Shared scanning core behind both garment detection (alphaScanBBox below)
// and artwork-bounds trimming (trimToVisibleBounds below). Both agree on
// what counts as "visible" (ALPHA_SUBJECT_THRESHOLD), but NOT on the
// neighbor-connectivity requirement: requireNeighbor exists specifically
// for the 1px-wide PNG-export-artifact defect documented on
// hasAboveThresholdNeighbor -- appropriate for a photographed GARMENT,
// which always has substantial real 2D extent, so a hairline with no
// neighbors is provably a defect, not the subject. That assumption is
// false for arbitrary uploaded ARTWORK: a deliberately tiny logo, a 1px
// hairline stroke, or even a legitimate 1x1 image has no 2D neighbors
// either, but IS the real content, not an artifact -- requiring
// neighbors there would incorrectly treat it as "fully transparent" and
// reject it outright. trimToVisibleBounds passes requireNeighbor=false for
// exactly this reason; alphaScanBBox keeps the existing true, unchanged.
function scanAboveThresholdBBox(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  requireNeighbor: boolean,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + 3];
      const isVisible =
        alpha > ALPHA_SUBJECT_THRESHOLD &&
        (!requireNeighbor || hasAboveThresholdNeighbor(data, width, height, channels, x, y));
      if (isVisible) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return { minX, minY, maxX, maxY };
}

async function alphaScanBBox(
  buffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  context?: GarmentBBoxLogContext,
): Promise<DetectedGarmentBBox | null> {
  const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let sawRealTransparency = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] < ALPHA_TRANSPARENCY_PRESENT_THRESHOLD) {
        sawRealTransparency = true;
      }
    }
  }

  const { minX, minY, maxX, maxY } = scanAboveThresholdBBox(data, width, height, channels, true);

  if (!sawRealTransparency || maxX < minX) return null;

  const bbox: DetectedGarmentBBox = {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    method: "alpha-scan",
  };
  assertPlausibleBBox(bbox, imageWidth, imageHeight, context);
  return bbox;
}

// Trims an artwork buffer to the tight bounding box of its actual visible
// content, so a user-uploaded image with transparent padding around a
// smaller logo doesn't have that padding silently stretched into the
// placement box by compositeArtworkOntoBase's fit:"fill" resize -- without
// this, the artwork's own reported width/height (and therefore the user's
// configured scale) describes the padded canvas, not the visible artwork.
//
// Reuses the same "visible content" ALPHA_SUBJECT_THRESHOLD detectGarmentBBox
// already uses (via scanAboveThresholdBBox above) -- semi-transparent
// shadow/glow edges above that threshold are preserved untouched; only
// near-fully-transparent padding gets trimmed. Never re-crops WITHIN the
// detected bounds, so aspect ratio and visible content are always fully
// preserved. Deliberately does NOT require neighbor-connectivity
// (scanAboveThresholdBBox's requireNeighbor=false) -- that check exists to
// filter a defect specific to photographed garments (see its own comment);
// a deliberately tiny/thin piece of artwork, including a legitimate 1x1
// image, is real content here, not an artifact to discard.
//
// An image with no alpha channel at all (JPEG, or a PNG/WebP that happens
// to be fully opaque) has no padding concept to trim -- returned unchanged.
// An image that's alpha-bearing but has NOTHING above threshold anywhere
// (a fully transparent upload) has no visible content to derive a bbox
// from -- fails closed with a RendererError rather than producing a
// zero-size or NaN placement downstream.
export async function trimToVisibleBounds(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  if (!meta.hasAlpha) return buffer;

  const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const { minX, minY, maxX, maxY } = scanAboveThresholdBBox(data, width, height, channels, false);

  if (maxX < minX) {
    throw new RendererError(
      "This artwork appears to be fully transparent -- there is no visible content to place.",
      400,
    );
  }

  // No-op fast path: the visible content already fills the whole canvas
  // (a tightly-cropped upload) -- skip the extract entirely rather than
  // re-encoding a buffer that would come out identical.
  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
    return buffer;
  }

  return sharp(buffer)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();
}

// Opaque photoreal image (Gemini's output -- observed to carry hasAlpha
// with alpha=255 everywhere, i.e. NOT actually transparent).
//
// This used to call sharp's trim(), which compares every pixel against a
// SINGLE fixed reference colour (sampled from one corner) with one fixed
// threshold. That failed on real Gemini output: a white garment on a
// white/near-white background can have a subtle but genuine lighting
// vignette (observed: top-left corner [229,230,230] vs bottom-right corner
// [201,200,194], a ~30-unit drift) -- small enough per-pixel step to be
// visually invisible, but large enough that its CUMULATIVE drift from one
// fixed corner reference exceeded trim()'s threshold before reaching the
// true garment edge, so trim silently gave up trimming that side and
// reported a garment ~65% wider than four other generations of the exact
// same request. Root-caused via scripts/investigate-geometry.mjs by
// comparing the failing run's raw pixels against a correct run's.
//
// Fix: flood-fill "background" inward from every border pixel, where two
// ADJACENT pixels are considered the same background region if they're
// within ADJACENT_STEP_THRESHOLD of EACH OTHER (not of one distant fixed
// reference). A smooth gradient/vignette has a tiny step at every single
// pixel (measured max 4 in the real failing case) even though its total
// corner-to-corner drift is large, so the flood traverses it completely;
// a genuine subject edge (hair, garment, or a rendering-defect solid-fill
// void) is a single large jump (measured 99+) that stops the flood. The
// detected garment bbox is the bounding box of whatever pixels the flood
// never reached. This also correctly handles a Gemini rendering defect
// observed separately (a solid-colour void filling part of the frame,
// touching the canvas edges): being internally uniform and border-
// touching, the void gets flood-filled as "background" too and is
// excluded from the subject bbox, rather than inflating it.
//
// Deliberately NOT connected-component analysis (picking the single
// largest contiguous non-background blob): tried it, and it discarded fine
// hair detail -- thin strands against a light background fragment into
// many small pixel-disconnected pieces at this threshold, so "largest
// component" kept only the torso/jeans mass and cropped the head off.
// Taking the union bbox of everything the flood didn't reach (this
// function) is what correctly spans hair + torso + jeans as one box, and
// was validated against 24+ real generations (scripts/investigate-
// geometry.mjs) including the vignette and void failure cases above.
function borderFloodFillBBox(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { left: number; top: number; width: number; height: number } {
  const total = width * height;
  const reachedFromBorder = new Uint8Array(total);
  const queue = new Int32Array(total);
  let queueHead = 0;
  let queueTail = 0;

  function withinStep(idxA: number, idxB: number): boolean {
    return (
      Math.abs(data[idxA] - data[idxB]) <= ADJACENT_STEP_THRESHOLD &&
      Math.abs(data[idxA + 1] - data[idxB + 1]) <= ADJACENT_STEP_THRESHOLD &&
      Math.abs(data[idxA + 2] - data[idxB + 2]) <= ADJACENT_STEP_THRESHOLD
    );
  }

  function seedBorder(x: number, y: number) {
    const pos = y * width + x;
    if (reachedFromBorder[pos]) return;
    reachedFromBorder[pos] = 1;
    queue[queueTail++] = pos;
  }

  function tryEnqueue(x: number, y: number, fromIdx: number) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const pos = y * width + x;
    if (reachedFromBorder[pos]) return;
    const idx = pos * channels;
    if (!withinStep(fromIdx, idx)) return;
    reachedFromBorder[pos] = 1;
    queue[queueTail++] = pos;
  }

  // Every border pixel is a valid background seed -- background is
  // whatever is CONNECTED to the border via small steps, regardless of
  // absolute colour, so a black backdrop and a white backdrop are handled
  // identically without needing to know the garment colour up front.
  for (let x = 0; x < width; x++) {
    seedBorder(x, 0);
    seedBorder(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seedBorder(0, y);
    seedBorder(width - 1, y);
  }

  while (queueHead < queueTail) {
    const pos = queue[queueHead++];
    const x = pos % width;
    const y = (pos - x) / width;
    const idx = pos * channels;
    tryEnqueue(x - 1, y, idx);
    tryEnqueue(x + 1, y, idx);
    tryEnqueue(x, y - 1, idx);
    tryEnqueue(x, y + 1, idx);
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!reachedFromBorder[y * width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function opaqueSubjectBBox(
  buffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  context?: GarmentBBoxLogContext,
): Promise<DetectedGarmentBBox> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const found = borderFloodFillBBox(data, width, height, channels);
  if (found.width <= 0 || found.height <= 0) {
    throw new RendererError("Could not detect the garment's bounding box in the generated image.", 500);
  }

  const bbox: DetectedGarmentBBox = { ...found, method: "border-flood-fill" };
  assertPlausibleBBox(bbox, imageWidth, imageHeight, context);
  return bbox;
}

export async function detectGarmentBBox(
  imageBuffer: Buffer,
  context?: GarmentBBoxLogContext,
): Promise<DetectedGarmentBBox> {
  const meta = await sharp(imageBuffer).metadata();
  const { width, height } = meta;
  if (!width || !height) {
    throw new RendererError("Image is missing dimensions; cannot detect the garment.", 500);
  }

  if (meta.hasAlpha) {
    const viaAlpha = await alphaScanBBox(imageBuffer, width, height, context);
    if (viaAlpha) return viaAlpha;
  }

  return opaqueSubjectBBox(imageBuffer, width, height, context);
}
