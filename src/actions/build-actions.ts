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
  const userId = await getUserId(); // ✅ may be null (guest)

  const nameRaw = formData.get("name");
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const safeName = name.length ? name.slice(0, 120) : "Untitled";

  const build = await prisma.build.create({
    data: {
      userId: userId ?? null, // ✅ guest build allowed by schema
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
    // ✅ allow this guest to access/edit this build later
    rememberGuestBuildId(build.id);
  }

  redirect(`/studio/projects/${build.id}/builder`);
}

export async function actionRenameBuild(buildId: string, formData: FormData) {
  const userId = await getUserId(); // string | null
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
  const quantity =
    typeof quantityRaw === "string" && quantityRaw.trim()
      ? Math.max(1, Math.min(9999, Number(quantityRaw)))
      : 1;

  const customNotesRaw = formData.get("customNotes");
  const customNotes =
    typeof customNotesRaw === "string" ? customNotesRaw.slice(0, 2000) : "";

  const primaryAssetIdRaw = formData.get("primaryAssetId");
  const primaryAssetId =
    typeof primaryAssetIdRaw === "string" ? primaryAssetIdRaw : "";

  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: { draft: { select: { id: true } } },
  });

  if (!build?.draft?.id) throw new Error("Draft not found");

  await prisma.buildDraft.update({
    where: { id: build.draft.id },
    data: {
      product: product ?? null,
      color: color ?? null,
      fabric: fabric ?? null,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      customNotes: customNotes.length ? customNotes : null,
      primaryAssetId: primaryAssetId.length ? primaryAssetId : null,
    },
  });
}