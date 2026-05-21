// file: src/actions/asset-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";

export async function actionCreateAsset(buildId: string, formData: FormData) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const fileName = String(formData.get("fileName") ?? "").trim().slice(0, 180);
  const mimeType =
    String(formData.get("mimeType") ?? "").trim().slice(0, 120) || null;
  const sizeBytesRaw = String(formData.get("sizeBytes") ?? "").trim();
  const sizeBytes = sizeBytesRaw
    ? Math.max(0, Math.floor(Number(sizeBytesRaw)))
    : null;

  if (!fileName) return;

  await prisma.asset.create({
    data: {
      buildId,
      fileName,
      mimeType,
      sizeBytes,
      status: "PENDING_UPLOAD",
    },
    select: { id: true },
  });

  revalidatePath(`/studio/projects/${buildId}/assets`);
  revalidatePath(`/studio/projects/${buildId}/designs`);
}