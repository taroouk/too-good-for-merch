import { mkdir, writeFile, readFile, access, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STORAGE_ROOT = path.resolve(process.cwd(), "storage");

function safeStoragePath(storageKey: string): string | null {
  const resolved = path.resolve(STORAGE_ROOT, storageKey);
  if (resolved === STORAGE_ROOT || !resolved.startsWith(`${STORAGE_ROOT}${path.sep}`)) {
    return null;
  }
  return resolved;
}

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;

export function extensionFor(fileName: string, mimeType: string) {
  const fromName = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (fromName && fromName.length <= 8) return fromName;
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/svg+xml") return ".svg";
  return ".bin";
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
    const text = buffer.subarray(0, 2048).toString("utf8").trimStart();
    return text.startsWith("<svg") || text.startsWith("<?xml");
  }
  return false;
}

export async function uploadArtwork(buildId: string, file: File) {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Artwork must be PNG, JPG, WEBP, or SVG.");
  }
  if (file.size <= 0 || file.size > MAX_ARTWORK_BYTES) {
    throw new Error("Artwork file must be smaller than 10MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!looksLikeAllowedArtwork(buffer, file.type)) {
    throw new Error("Artwork file content does not match its file type.");
  }

  const id = randomUUID();
  const ext = extensionFor(file.name, file.type);
  const storageKey = `artwork/${buildId}/${id}${ext}`;
  const absolutePath = safeStoragePath(storageKey);
  if (!absolutePath) throw new Error("Invalid storage key.");

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer, { flag: "wx" });

  return { id, storageKey, url: `/api/assets/${id}/file` };
}

export async function getArtwork(storageKey: string): Promise<Buffer | null> {
  if (!storageKey) return null;

  const absolutePath = safeStoragePath(storageKey);
  if (!absolutePath) return null;

  try {
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}

export async function deleteArtwork(storageKey: string): Promise<void> {
  if (!storageKey) return;

  const absolutePath = safeStoragePath(storageKey);
  if (!absolutePath) return;

  try {
    await access(absolutePath);
    await unlink(absolutePath);
  } catch {
    // ignore
  }
}
