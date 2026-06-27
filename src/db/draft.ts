// src/db/draft.ts
import { prisma } from "src/lib/prisma";

export type ProductType = "FITTED" | "OVERSIZED" | "CUSTOM";

export type GarmentColor = "BLACK" | "WHITE" | "CUSTOM";

export type FabricType = "ESSENTIALS_170" | "SIGNATURE_200" | "HEAVYWEIGHT_300";

export type DraftPatch = {
  product?: ProductType | null;
  color?: GarmentColor | null;
  fabric?: FabricType | null;
  quantity?: number | null;
  customNotes?: string | null;
  primaryAssetId?: string | null;
};

function clampQty(q: unknown): number | undefined {
  if (typeof q !== "number" || !Number.isFinite(q)) return undefined;
  const v = Math.floor(q);
  if (v < 1) return 1;
  if (v > 9999) return 9999;
  return v;
}

export async function updateDraftForBuild(userId: string, buildId: string, patch: DraftPatch) {
  const build = await prisma.build.findFirst({
    where: { id: buildId, userId },
    select: { id: true, draft: { select: { id: true } } },
  });

  if (!build?.draft?.id) throw new Error("Not found");

  const quantity = clampQty(patch.quantity);

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
