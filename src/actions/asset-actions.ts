// file: src/actions/asset-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";

async function createAssetRecord(buildId: string, formData: FormData) {
  const fileName = String(formData.get("fileName") ?? "").trim().slice(0, 180);
  const mimeType =
    String(formData.get("mimeType") ?? "").trim().slice(0, 120) || null;
  const sizeBytesRaw = String(formData.get("sizeBytes") ?? "").trim();
  const sizeBytes = sizeBytesRaw
    ? Math.max(0, Math.floor(Number(sizeBytesRaw)))
    : null;

  if (!fileName) return;

  return prisma.asset.create({
    data: {
      buildId,
      fileName,
      mimeType,
      sizeBytes,
      status: "PENDING_UPLOAD",
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
