// src/actions/build-actions.ts
"use server";

import { redirect } from "next/navigation";
import { requireUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import { createBuildForUser, renameBuild } from "src/db/builds";
import { updateDraftForBuild } from "src/db/draft";
import type { FabricType, GarmentColor, ProductType } from "@prisma/client";

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export async function actionCreateBuild(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "");
  const build = await createBuildForUser(userId, name);
  redirect(`/studio/projects/${build.id}/builder`);
}

export async function actionRenameBuild(buildId: string, formData: FormData) {
  const userId = await requireUserId();
  await assertBuildAccess(userId, buildId);
  const name = String(formData.get("name") ?? "");
  await renameBuild(userId, buildId, name);
  redirect(`/studio/projects/${buildId}`);
}

const PRODUCT: readonly ProductType[] = ["FITTED", "OVERSIZED", "CUSTOM"] as const;
const COLOR: readonly GarmentColor[] = ["BLACK", "WHITE", "CUSTOM"] as const;
const FABRIC: readonly FabricType[] = ["ESSENTIALS_170", "SIGNATURE_200", "HEAVYWEIGHT_300"] as const;

export async function actionUpdateDraft(buildId: string, formData: FormData) {
  const userId = await requireUserId();
  await assertBuildAccess(userId, buildId);

  const product = asEnum<ProductType>(formData.get("product"), PRODUCT);
  const color = asEnum<GarmentColor>(formData.get("color"), COLOR);
  const fabric = asEnum<FabricType>(formData.get("fabric"), FABRIC);

  const quantityRaw = formData.get("quantity");
  const quantity = typeof quantityRaw === "string" && quantityRaw.trim() ? Number(quantityRaw) : undefined;

  const customNotes = String(formData.get("customNotes") ?? "").trim() || null;
  const primaryAssetId = (String(formData.get("primaryAssetId") ?? "").trim() || null) as string | null;

  await updateDraftForBuild(userId, buildId, {
    product,
    color,
    fabric,
    quantity: Number.isFinite(quantity as number) ? (quantity as number) : undefined,
    customNotes,
    primaryAssetId,
  });
}