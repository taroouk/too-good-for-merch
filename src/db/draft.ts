// src/db/draft.ts
import {prisma} from "src/lib/prisma";
import type { FabricType, GarmentColor, ProductType } from "@prisma/client";

export type DraftPatch = {
  product?: ProductType | null;
  color?: GarmentColor | null;
  fabric?: FabricType | null;
  quantity?: number;
  customNotes?: string | null;
  primaryAssetId?: string | null;
};

export async function updateDraftForBuild(userId: string, buildId: string, patch: DraftPatch) {
  const build = await prisma.build.findFirst({
    where: { id: buildId, userId },
    select: { id: true, draft: { select: { id: true } } },
  });
  if (!build?.draft?.id) throw new Error("Not found");

  const quantity =
    typeof patch.quantity === "number"
      ? Math.max(1, Math.min(9999, Math.floor(patch.quantity)))
      : undefined;

  return prisma.buildDraft.update({
    where: { id: build.draft.id },
    data: {
      product: patch.product ?? undefined,
      color: patch.color ?? undefined,
      fabric: patch.fabric ?? undefined,
      quantity: quantity ?? undefined,
      customNotes: patch.customNotes ?? undefined,
      primaryAssetId: patch.primaryAssetId ?? undefined,
    },
    select: {
      id: true,
      product: true,
      color: true,
      fabric: true,
      quantity: true,
      customNotes: true,
      primaryAssetId: true,
    },
  });
}