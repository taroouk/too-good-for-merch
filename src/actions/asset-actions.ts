// file: src/actions/asset-actions.ts
"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import { hashArtworkData, uploadArtwork } from "src/lib/storage";
import { clientIpFromHeaders } from "src/lib/rate-limit";
import { rateLimitByKey } from "src/lib/rate-limit-db";

// P2-8: uploads (artwork bytes -> storage + DB row) were previously
// completely unbounded per user/IP -- a compromised or scripted client
// could hammer this server action to burn storage and DB write capacity
// with no ceiling at all. Server actions don't receive a Request object,
// so the client IP is read from next/headers() instead (same trusted
// x-forwarded-for-only model as the route-handler limiter). DB-backed
// because this is a real write with real cost across every instance, not a
// cheap in-memory-only operation.
const UPLOAD_LIMIT = 30;
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

async function enforceUploadRateLimit(userId: string | null) {
  const key = userId ?? `ip:${clientIpFromHeaders(await headers())}`;
  const limit = await rateLimitByKey("asset:upload", key, UPLOAD_LIMIT, UPLOAD_WINDOW_MS);
  if (!limit.ok) {
    throw new Error("Too many uploads. Please wait a few minutes and try again.");
  }
}

async function createAssetRecord(buildId: string, formData: FormData) {
  const file = formData.get("file");
  const uploadedFile = file instanceof File && file.size > 0 ? file : null;
  const fileName = (uploadedFile?.name ?? String(formData.get("fileName") ?? "")).trim().slice(0, 180);
  const mimeType = (uploadedFile?.type ?? String(formData.get("mimeType") ?? "")).trim().slice(0, 120) || null;
  const sizeBytesRaw = String(formData.get("sizeBytes") ?? "").trim();
  const sizeBytes = uploadedFile?.size ?? (sizeBytesRaw ? Math.max(0, Math.floor(Number(sizeBytesRaw))) : null);

  if (!fileName) return;

  const stored = uploadedFile ? await uploadArtwork(uploadedFile) : null;

  return prisma.asset.create({
    data: {
      ...(stored ? { id: stored.id } : {}),
      buildId,
      fileName,
      mimeType: stored?.contentType ?? mimeType,
      sizeBytes: stored?.fileSize ?? sizeBytes,
      uploadedAt: stored?.uploadedAt,
      artworkData: stored?.data,
      artworkSha256: stored?.artworkSha256,
      storageKey: null,
      url: stored?.url ?? null,
      status: stored ? "READY" : "PENDING_UPLOAD",
    },
    select: { id: true, buildId: true, fileName: true, url: true },
  });
}

export async function actionCreateAsset(buildId: string, formData: FormData) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);
  await enforceUploadRateLimit(userId);

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
  await enforceUploadRateLimit(userId);

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
      uploadedAt: true,
      artworkData: true,
      artworkSha256: true,
      status: true,
      url: true,
    },
  });

  if (!source?.url || !source.artworkData) return null;

  if (source.buildId === buildId) {
    return {
      id: source.id,
      buildId: source.buildId,
      fileName: source.fileName,
      url: source.url,
    };
  }

  const copiedId = randomUUID();
  const copied = await prisma.asset.create({
    data: {
      id: copiedId,
      buildId,
      fileName: source.fileName,
      mimeType: source.mimeType,
      sizeBytes: source.sizeBytes,
      uploadedAt: source.uploadedAt,
      artworkData: source.artworkData,
      artworkSha256: source.artworkSha256 ?? hashArtworkData(source.artworkData),
      storageKey: null,
      status: source.status,
      url: `/api/assets/${copiedId}/file`,
    },
    select: { id: true, buildId: true, fileName: true, url: true },
  });

  revalidatePath(`/studio/projects/${buildId}/assets`);
  revalidatePath(`/studio/projects/${buildId}/designs`);

  return copied;
}
