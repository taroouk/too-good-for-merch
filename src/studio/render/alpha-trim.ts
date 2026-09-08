// file: src/studio/render/alpha-trim.ts
//
// Pure, environment-agnostic alpha-channel bounding-box scan. Extracted out
// of garment-bbox.ts (which is Node/Sharp-only and imports "sharp" at module
// scope, so it can never be imported from client components) so the exact
// same "what counts as visible content" decision can be reused by:
//   - the server (garment-bbox.ts's trimToVisibleBounds / alphaScanBBox),
//     fed a Buffer decoded via sharp(...).raw().ensureAlpha()
//   - the client live preview (useTrimmedArtworkUrl.ts), fed a
//     Uint8ClampedArray from canvas 2D context's getImageData()
//
// Both a Node Buffer and a browser Uint8ClampedArray/Uint8Array support the
// same `data[i]` byte-indexing this scan relies on, so one implementation
// works unmodified in both places -- no separate client reimplementation of
// the trimming algorithm, and no possibility of the two silently drifting
// apart the way the client preview's box geometry previously did.
//
// This file must NOT import "sharp" or any other Node-only module -- that
// is the entire point of its existence.

export const ALPHA_SUBJECT_THRESHOLD = 10;

export type AlphaBytes = Uint8Array | Uint8ClampedArray;

export type ScannedBounds = { minX: number; minY: number; maxX: number; maxY: number };

// See garment-bbox.ts's original comment on this check (preserved there):
// requiring both an orthogonal AND a diagonal above-threshold neighbour
// filters out 1px-wide PNG-export-artifact hairlines (real garment photos
// always have substantial 2D extent) without discarding legitimately tiny
// but real ARTWORK content when requireNeighbor=false is used instead (see
// scanAboveThresholdBBox below).
export function hasAboveThresholdNeighbor(
  data: AlphaBytes,
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
    nx >= 0 &&
    nx < width &&
    ny >= 0 &&
    ny < height &&
    data[(ny * width + nx) * channels + 3] > ALPHA_SUBJECT_THRESHOLD;

  const hasOrthogonal = orthogonal.some(([nx, ny]) => above(nx, ny));
  const hasDiagonal = diagonal.some(([nx, ny]) => above(nx, ny));
  return hasOrthogonal && hasDiagonal;
}

// Shared scanning core. `requireNeighbor=false` is the mode artwork
// trimming needs (see trimToVisibleBounds's own comment for why); `true` is
// the mode garment-photo bbox detection needs.
export function scanAboveThresholdBBox(
  data: AlphaBytes,
  width: number,
  height: number,
  channels: number,
  requireNeighbor: boolean,
): ScannedBounds {
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
