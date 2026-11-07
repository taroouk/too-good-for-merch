// file: src/studio/artwork-kind.ts
//
// Tells the customer (never changes the image) whether an upload is a
// transparent PNG/SVG, or an opaque picture -- and whether that picture has a
// white background. Purely informational: the artwork is always printed
// exactly as uploaded; nothing here removes, recolours or crops a background.
//
// Pure and environment-agnostic (a Node Buffer or a canvas Uint8ClampedArray
// both work) so it is unit tested and used by the Studio popup.

export type ArtworkKind = {
  // Has real transparency (more than a sliver of pixels is see-through).
  transparent: boolean;
  // The picture's border is opaque, near-white paint: it prints as a white
  // rectangle behind the design, which shows on dark garments.
  whiteBackground: boolean;
};

type Bytes = Uint8Array | Uint8ClampedArray;

const TRANSPARENT_ALPHA = 250; // below this a pixel counts as see-through
const TRANSPARENT_MIN_SHARE = 0.005; // 0.5% of pixels
const WHITE_LUMA = 238;
const WHITE_MAX_CHROMA = 14;
const WHITE_BORDER_SHARE = 0.92;

export function classifyArtwork(data: Bytes, width: number, height: number, channels = 4): ArtworkKind {
  if (width <= 0 || height <= 0) return { transparent: false, whiteBackground: false };
  const hasAlphaChannel = channels === 4;
  const alphaAt = (i: number) => (hasAlphaChannel ? data[i * channels + 3] : 255);

  let seeThrough = 0;
  for (let i = 0; i < width * height; i++) if (alphaAt(i) < TRANSPARENT_ALPHA) seeThrough++;

  // Border ring (2px, so a 1px anti-aliased/JPEG edge does not decide it).
  let border = 0, whiteBorder = 0;
  const ring = Math.max(1, Math.min(2, Math.floor(Math.min(width, height) / 4)));
  const isWhite = (i: number) => {
    const r = data[i * channels], g = data[i * channels + 1], b = data[i * channels + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    return alphaAt(i) >= TRANSPARENT_ALPHA && l >= WHITE_LUMA && Math.max(r, g, b) - Math.min(r, g, b) <= WHITE_MAX_CHROMA;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= ring && x < width - ring && y >= ring && y < height - ring) {
        x = width - ring - 1; // jump across the interior
        continue;
      }
      border++;
      if (isWhite(y * width + x)) whiteBorder++;
    }
  }

  return {
    transparent: seeThrough / (width * height) > TRANSPARENT_MIN_SHARE,
    whiteBackground: border > 0 && whiteBorder / border >= WHITE_BORDER_SHARE,
  };
}

// The wording shown under the artwork tools.
export function artworkKindNotice(kind: ArtworkKind): string {
  if (kind.whiteBackground) {
    return "This image has a white background. It prints as a white rectangle behind your design (visible on dark T-shirts). Use a transparent PNG to print just the design.";
  }
  if (kind.transparent) return "Transparent background: only your design prints, the T-shirt shows through.";
  return "Opaque image: the whole picture prints, including its background.";
}
