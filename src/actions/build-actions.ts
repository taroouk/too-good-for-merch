// file: src/actions/build-actions.ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess, rememberGuestBuildId } from "src/studio/permissions";
import { BuildStatus } from "@prisma/client";

const PRODUCT = ["FITTED", "OVERSIZED", "CUSTOM"] as const;
const COLOR = ["BLACK", "WHITE", "CUSTOM"] as const;
const FABRIC = ["ESSENTIALS_170", "SIGNATURE_200", "HEAVYWEIGHT_300"] as const;

function asEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T
): T[number] | null {
  if (typeof value !== "string") return null;
  return (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

export async function actionCreateBuild(formData: FormData) {
  const userId = await getUserId();

  const nameRaw = formData.get("name");
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const safeName = name.length ? name.slice(0, 120) : "Untitled";

  const build = await prisma.build.create({
    data: {
      userId: userId ?? null,
      name: safeName,
      status: BuildStatus.ACTIVE,
      draft: {
        create: {
          product: null,
          color: null,
          fabric: null,
          quantity: 1,
          customNotes: null,
          primaryAssetId: null,
        },
      },
    },
    select: { id: true },
  });

  if (!userId) {
    await rememberGuestBuildId(build.id);
  }

  redirect(`/studio/projects/${build.id}/builder`);
}

export async function actionRenameBuild(buildId: string, formData: FormData) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const nameRaw = formData.get("name");
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const safeName = name.length ? name.slice(0, 120) : "Untitled";

  await prisma.build.update({
    where: { id: buildId },
    data: { name: safeName },
    select: { id: true },
  });

  redirect(`/studio/projects/${buildId}/settings`);
}

export async function actionUpdateDraft(buildId: string, formData: FormData) {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const product = asEnum(formData.get("product"), PRODUCT);
  const color = asEnum(formData.get("color"), COLOR);
  const fabric = asEnum(formData.get("fabric"), FABRIC);

  const quantityRaw = formData.get("quantity");
  const quantityParsed =
    typeof quantityRaw === "string" && quantityRaw.trim() ? Number(quantityRaw) : NaN;
  const quantity = Number.isFinite(quantityParsed)
    ? Math.max(1, Math.min(9999, Math.round(quantityParsed)))
    : 1;

  const customNotesRaw = formData.get("customNotes");
  const customNotes =
    typeof customNotesRaw === "string" ? customNotesRaw.slice(0, 2000) : "";

  const primaryAssetIdRaw = formData.get("primaryAssetId");
  const primaryAssetId =
    typeof primaryAssetIdRaw === "string" ? primaryAssetIdRaw : "";

  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: {
      draft: {
        select: {
          id: true,
          product: true,
          color: true,
          fabric: true,
          quantity: true,
          customNotes: true,
          primaryAssetId: true,
          customQuoteUsdCents: true,
        },
      },
    },
  });

  if (!build?.draft?.id) throw new Error("Draft not found");

  const draft = build.draft;
  const nextCustomNotes = customNotes.length ? customNotes : null;
  const nextPrimaryAssetId = await validPrimaryAssetId(buildId, primaryAssetId);

  // An admin-set Bespoke/Custom quote (see src/actions/admin-bespoke-actions.ts)
  // is only valid for the exact draft state it was quoted against -- if
  // anything the admin actually priced has changed, drop it so a stale
  // price can never be reused for a materially different request. No-op
  // when there was no active quote to begin with.
  const changed =
    draft.product !== (product ?? null) ||
    draft.color !== (color ?? null) ||
    draft.fabric !== (fabric ?? null) ||
    draft.quantity !== quantity ||
    draft.customNotes !== nextCustomNotes ||
    draft.primaryAssetId !== nextPrimaryAssetId;

  await prisma.buildDraft.update({
    where: { id: draft.id },
    data: {
      product: product ?? null,
      color: color ?? null,
      fabric: fabric ?? null,
      quantity,
      customNotes: nextCustomNotes,
      primaryAssetId: nextPrimaryAssetId,
      ...(changed && draft.customQuoteUsdCents != null
        ? {
            customQuoteUsdCents: null,
            customQuoteNote: null,
            customQuotedAt: null,
            customQuotedByEmail: null,
          }
        : {}),
    },
  });
}

async function validPrimaryAssetId(buildId: string, assetId: string) {
  if (!assetId.length) return null;

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, buildId },
    select: { id: true },
  });

  return asset?.id ?? null;
}
