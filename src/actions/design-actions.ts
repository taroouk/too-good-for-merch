// file: src/actions/design-actions.ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";

const PLACEMENTS = [
  "LEFT_CHEST",
  "RIGHT_CHEST",
  "RIGHT_SLEEVE",
  "LEFT_SLEEVE",
  "CENTER_FRONT",
  "FULL_FRONT",
  "CENTER_BACK",
  "FULL_BACK",
] as const;

type Placement = (typeof PLACEMENTS)[number];

function asPlacement(value: unknown): Placement | null {
  if (typeof value !== "string") return null;
  return (PLACEMENTS as readonly string[]).includes(value)
    ? (value as Placement)
    : null;
}

export async function actionCreateDesign(buildId: string, formData: FormData) {
  const userId = await getUserId(); // ✅ guest allowed
  await assertBuildAccess(userId, buildId); // ✅ owner OR guest cookie

  const nameRaw = formData.get("name");
  const name = typeof nameRaw === "string" ? nameRaw.trim().slice(0, 120) : "";
  const safeName = name.length ? name : "Design";

  const design = await prisma.design.create({
    data: { buildId, name: safeName },
    select: { id: true },
  });

  redirect(`/studio/projects/${buildId}/designs?design=${design.id}`);
}

export async function actionSetPlacementAsset(
  buildId: string,
  formData: FormData
) {
  const userId = await getUserId(); // ✅ guest allowed
  await assertBuildAccess(userId, buildId); // ✅ owner OR guest cookie

  const designId = String(formData.get("designId") ?? "");
  const placement = asPlacement(formData.get("placement"));
  const assetId = String(formData.get("assetId") ?? "");

  if (!designId || !placement) return;

  const design = await prisma.design.findFirst({
    where: { id: designId, buildId },
    select: { id: true },
  });
  if (!design) return;

  if (!assetId) {
    await prisma.designPlacement.deleteMany({
      where: { designId, placement: placement as any },
    });
    return;
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, buildId },
    select: { id: true },
  });
  if (!asset) return;

  await prisma.designPlacement.upsert({
    where: {
      designId_placement: {
        designId,
        placement: placement as any,
      },
    },
    update: { assetId },
    create: { designId, placement: placement as any, assetId },
  });
}

export async function actionRemovePlacement(buildId: string, formData: FormData) {
  const userId = await getUserId(); // ✅ guest allowed
  await assertBuildAccess(userId, buildId); // ✅ owner OR guest cookie

  const designId = String(formData.get("designId") ?? "");
  const placement = asPlacement(formData.get("placement"));
  if (!designId || !placement) return;

  await prisma.designPlacement.deleteMany({
    where: { designId, placement: placement as any },
  });
}