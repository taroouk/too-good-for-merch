"use server";

import { redirect } from "next/navigation";
import { prisma } from "src/lib/prisma";
import { requireUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import type { PlacementType } from "@prisma/client";

const PLACEMENTS: readonly PlacementType[] = [
  "LEFT_CHEST",
  "RIGHT_CHEST",
  "RIGHT_SLEEVE",
  "LEFT_SLEEVE",
  "CENTER_FRONT",
  "FULL_FRONT",
  "CENTER_BACK",
  "FULL_BACK",
] as const;

function asPlacement(value: unknown): PlacementType | null {
  if (typeof value !== "string") return null;
  return (PLACEMENTS as readonly string[]).includes(value) ? (value as PlacementType) : null;
}

export async function actionCreateDesign(buildId: string, formData: FormData) {
  const userId = await requireUserId();
  await assertBuildAccess(userId, buildId);

  const name = String(formData.get("name") ?? "").trim().slice(0, 120) || "Design";
  const design = await prisma.design.create({
    data: { buildId, name },
    select: { id: true },
  });

  redirect(`/studio/projects/${buildId}/designs?design=${design.id}`);
}

export async function actionSetPlacementAsset(buildId: string, formData: FormData) {
  const userId = await requireUserId();
  await assertBuildAccess(userId, buildId);

  const designId = String(formData.get("designId") ?? "");
  const placement = asPlacement(formData.get("placement"));
  const assetId = String(formData.get("assetId") ?? "");

  if (!designId || !placement || !assetId) return;

  const design = await prisma.design.findFirst({
    where: { id: designId, buildId },
    select: { id: true },
  });
  if (!design) throw new Error("Not found");

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, buildId },
    select: { id: true },
  });
  if (!asset) throw new Error("Invalid asset");

  await prisma.designPlacement.upsert({
    where: { designId_placement: { designId, placement } },
    create: { designId, placement, assetId },
    update: { assetId },
  });
}

export async function actionRemovePlacement(buildId: string, formData: FormData) {
  const userId = await requireUserId();
  await assertBuildAccess(userId, buildId);

  const designId = String(formData.get("designId") ?? "");
  const placement = asPlacement(formData.get("placement"));
  if (!designId || !placement) return;

  await prisma.designPlacement.deleteMany({
    where: { designId, placement, design: { buildId } },
  });
}