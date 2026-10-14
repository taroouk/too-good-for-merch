// Raster artwork is decoded in full by the print-mockup pipeline (sharp), so
// a tiny file can still be enormous in memory: a 2 MB 10000x10000 PNG pushed
// the server from ~210 MB to ~920 MB. The byte limit alone does not stop it.
// 6000x6000 (36 MP) is well above print needs (A3 @ 300 dpi is ~17 MP).
export const MAX_ARTWORK_DIMENSION = 8000;
export const MAX_ARTWORK_PIXELS = 36_000_000;

export function artworkExceedsDimensionLimits(width: number, height: number) {
  return (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width > MAX_ARTWORK_DIMENSION ||
    height > MAX_ARTWORK_DIMENSION ||
    width * height > MAX_ARTWORK_PIXELS
  );
}
