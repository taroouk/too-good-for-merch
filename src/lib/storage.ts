import { createHash, randomUUID } from "node:crypto";
import { prisma } from "src/lib/prisma";
import { isSvgContentSafe } from "src/lib/svg-safety";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;

function normalizeArtworkMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === "image/jpg" || normalized === "image/pjpeg") return "image/jpeg";
  return normalized;
}

export function hashArtworkData(data: Buffer | Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

export function looksLikeAllowedArtwork(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mimeType === "image/svg+xml") {
    const text = buffer.subarray(0, 2048).toString("utf8").trimStart().toLowerCase();
    return text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"));
  }
  return false;
}

// P2-9: see src/lib/svg-safety.ts for the full rationale -- raw,
// unsanitized user-uploaded SVGs flow from here into sharp()
// (src/studio/render/engines/sharp-renderer.ts, composite.ts) for
// server-side print-mockup rasterization via libvips/librsvg.

export async function uploadArtwork(file: File) {
  const contentType = normalizeArtworkMimeType(file.type);

  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    throw new Error("Artwork must be PNG, JPG, WEBP, or SVG.");
  }
  if (file.size <= 0 || file.size > MAX_ARTWORK_BYTES) {
    throw new Error("Artwork file must be 10MB or smaller.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength <= 0 || buffer.byteLength > MAX_ARTWORK_BYTES) {
    throw new Error("Artwork file must be 10MB or smaller.");
  }
  if (!looksLikeAllowedArtwork(buffer, contentType)) {
    throw new Error("Artwork file content does not match its file type.");
  }
  if (contentType === "image/svg+xml" && !isSvgContentSafe(buffer)) {
    throw new Error("This SVG file contains unsupported content (scripts, external references, or embedded elements) and cannot be uploaded.");
  }

  const id = randomUUID();

  return {
    id,
    contentType,
    fileSize: buffer.byteLength,
    data: buffer,
    artworkSha256: hashArtworkData(buffer),
    uploadedAt: new Date(),
    url: `/api/assets/${id}/file`,
  };
}

export async function getArtwork(assetId: string): Promise<Buffer | null> {
  if (!assetId) return null;

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { artworkData: true },
  });

  return asset?.artworkData ? Buffer.from(asset.artworkData) : null;
}

const ALLOWED_MOCKUP_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export function looksLikeAllowedMockup(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

export function normalizeMockupMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === "image/jpg" || normalized === "image/pjpeg") return "image/jpeg";
  return normalized;
}

export function validateMockupData(buffer: Buffer, mimeType: string) {
  const normalized = normalizeMockupMimeType(mimeType);
  if (!ALLOWED_MOCKUP_MIME_TYPES.has(normalized)) {
    throw new Error("AI mockup must be PNG, JPG, or WEBP.");
  }
  if (buffer.byteLength <= 0 || buffer.byteLength > 15 * 1024 * 1024) {
    throw new Error("AI mockup file must be 15MB or smaller.");
  }
  if (!looksLikeAllowedMockup(buffer, normalized)) {
    throw new Error("AI mockup content does not match its file type.");
  }
  return normalized;
}

export async function getMockup(mockupId: string): Promise<Buffer | null> {
  if (!mockupId) return null;

  const mockup = await prisma.mockup.findUnique({
    where: { id: mockupId },
    select: { data: true, mimeType: true },
  });

  if (!mockup?.data) return null;
  return Buffer.from(mockup.data);
}
