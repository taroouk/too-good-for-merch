// file: src/actions/asset-actions.ts
"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";

const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

function extensionFor(fileName: string, mimeType: string) {
  const fromName = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (fromName && fromName.length <= 8) return fromName;
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/svg+xml") return ".svg";
  return ".bin";
}

function looksLikeAllowedArtwork(buffer: Buffer, mimeType: string) {
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

async function persistArtworkFile(buildId: string, file: File) {
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
  const absolutePath = path.join(process.cwd(), "storage", storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer, { flag: "wx" });
  return { id, storageKey };
}

async function createAssetRecord(buildId: string, formData: FormData) {
  const file = formData.get("file");
  const uploadedFile = file instanceof File && file.size > 0 ? file : null;
  const fileName = (uploadedFile?.name ?? String(formData.get("fileName") ?? "")).trim().slice(0, 180);
  const mimeType = (uploadedFile?.type ?? String(formData.get("mimeType") ?? "")).trim().slice(0, 120) || null;
  const sizeBytesRaw = String(formData.get("sizeBytes") ?? "").trim();
  const sizeBytes = uploadedFile?.size ?? (sizeBytesRaw ? Math.max(0, Math.floor(Number(sizeBytesRaw))) : null);

  if (!fileName) return;

  const stored = uploadedFile ? await persistArtworkFile(buildId, uploadedFile) : null;

  return prisma.asset.create({
    data: {
      ...(stored ? { id: stored.id } : {}),
      buildId,
      fileName,
      mimeType,
      sizeBytes,
      storageKey: stored?.storageKey ?? null,
      url: stored ? `/api/assets/${stored.id}/file` : null,
      status: stored ? "READY" : "PENDING_UPLOAD",
    },
    select: { id: true, buildId: true, fileName: true, url: true },
  });
}

export async function actionCreateAsset(buildId: string, formData: FormData) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  await createAssetRecord(buildId, formData);

  revalidatePath(`/studio/projects/${buildId}/assets`);
  revalidatePath(`/studio/projects/${buildId}/designs`);
}

export async function actionCreateAssetForBuilder(
  buildId: string,
  formData: FormData,
) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const asset = await createAssetRecord(buildId, formData);

  revalidatePath(`/studio/projects/${buildId}/assets`);
  revalidatePath(`/studio/projects/${buildId}/designs`);

  return asset;
}

export async function actionAttachExistingAsset(
  buildId: string,
  sourceAssetId: string,
) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const allowedSourceWhere = userId
    ? [{ buildId }, { build: { userId } }]
    : [{ buildId }];

  const source = await prisma.asset.findFirst({
    where: {
      id: sourceAssetId,
      url: { not: null },
      OR: allowedSourceWhere,
    },
    select: {
      id: true,
      buildId: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      storageKey: true,
      status: true,
      url: true,
    },
  });

  if (!source?.url) return null;

  if (source.buildId === buildId) {
    return {
      id: source.id,
      buildId: source.buildId,
      fileName: source.fileName,
      url: source.url,
    };
  }

  const copied = await prisma.asset.create({
    data: {
      buildId,
      fileName: source.fileName,
      mimeType: source.mimeType,
      sizeBytes: source.sizeBytes,
      storageKey: source.storageKey,
      status: source.status,
      url: source.url,
    },
    select: { id: true, buildId: true, fileName: true, url: true },
  });

  revalidatePath(`/studio/projects/${buildId}/assets`);
  revalidatePath(`/studio/projects/${buildId}/designs`);

  return copied;
}
