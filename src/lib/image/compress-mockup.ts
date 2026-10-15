import sharp from "sharp";

// Longest side of a stored mockup/artwork image and its WebP quality. The
// model photos are shown at a fraction of this and downloaded for printing
// references, so the multi-MB PNGs Gemini/sharp produce are pure storage cost.
export const COMPRESSED_MAX_SIDE = 1600;
export const COMPRESSED_QUALITY = 82;

// Re-encodes an image as WebP (keeps transparency) at a sane size. Falls back
// to the original bytes when the input can't be decoded or when the result
// wouldn't actually be smaller.
export async function compressMockupImage(
  data: Buffer,
  mimeType: string,
): Promise<{ data: Buffer; mimeType: string; compressed: boolean }> {
  try {
    const out = await sharp(data)
      .resize({ width: COMPRESSED_MAX_SIDE, height: COMPRESSED_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: COMPRESSED_QUALITY, effort: 4 })
      .toBuffer();
    if (out.byteLength > 0 && out.byteLength < data.byteLength) {
      return { data: out, mimeType: "image/webp", compressed: true };
    }
  } catch {
    // fall through to the original
  }
  return { data, mimeType, compressed: false };
}

export function extensionForMime(mimeType: string | null | undefined): string {
  switch ((mimeType ?? "").toLowerCase()) {
    case "image/webp":
      return "webp";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    default:
      return "png";
  }
}
