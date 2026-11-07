// file: src/actions/wishlist-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { draftArtworkLayers, normalizeArtworkLayers } from "src/studio/artwork-layers";
import { upsertPlacementsInNotes } from "src/pricing/placements";
import { prisma } from "src/lib/prisma";
import { getUserId, requireUserId } from "src/studio/authz";
import { canAccessBuild } from "src/studio/permissions";
import { placementsFromCustomNotes, placementsOrDefault } from "src/pricing/placements";
import { normalizeArtworkPlacement } from "src/lib/artwork/save";
import { resolveArtworkIdForBuild } from "src/lib/artwork/persist";

export type WishlistActionResult =
  | { ok: true; itemId: string; inWishlist: boolean }
  | { ok: false; error: string };

// Persistent, DB-owned wishlist. One row per (user, build): adding the
// same build again refreshes the snapshot rather than duplicating.
export async function actionAddToWishlist(buildId: string, size?: string | null): Promise<WishlistActionResult> {
  const cleanBuildId = typeof buildId === "string" ? buildId.trim().slice(0, 128) : "";
  const userId = await requireUserId(
    `/studio/projects/${cleanBuildId}/builder`,
  );
  if (!cleanBuildId) return { ok: false, error: "A build is required." };

  const build = await prisma.build.findUnique({
    where: { id: cleanBuildId },
    select: {
      id: true,
      userId: true,
      draft: {
        select: {
          product: true,
          color: true,
          fabric: true,
          quantity: true,
          customNotes: true,
          artworkPlacement: true,
          primaryAssetId: true,
          artworkLayers: true,
          printMockupId: true,
          printMockupFingerprint: true,
          aiMockupId: true,
          aiMockupFingerprint: true,
          backPrintMockupId: true,
          backPrintMockupFingerprint: true,
          backAiMockupId: true,
          backAiMockupFingerprint: true,
        },
      },
    },
  });
  if (!build?.draft) return { ok: false, error: "Build not found." };
  if (!(await canAccessBuild(userId, build))) {
    return { ok: false, error: "You cannot add this build to your wishlist." };
  }

  if (!build.userId) {
    await prisma.build.update({ where: { id: cleanBuildId }, data: { userId } });
  }

  const artworkId = await resolveArtworkIdForBuild(
    cleanBuildId,
    userId,
    build.draft.artworkPlacement,
  );

  const placements = placementsOrDefault(
    placementsFromCustomNotes(build.draft.customNotes),
  );
  const transform = normalizeArtworkPlacement(build.draft.artworkPlacement);
  const quantity = Math.max(1, Math.min(9999, Math.round(Number(build.draft.quantity ?? 1)) || 1));

  // Everything needed to reopen exactly this design: the artwork layers
  // (placement, position, zoom, rotation -- the crop is baked into the asset),
  // the mockup photos and the print notes.
  const draft = build.draft;
  const design = {
    layers: draftArtworkLayers(draft),
    customNotes: draft.customNotes ?? null,
    mockups: {
      printMockupId: draft.printMockupId,
      printMockupFingerprint: draft.printMockupFingerprint,
      aiMockupId: draft.aiMockupId,
      aiMockupFingerprint: draft.aiMockupFingerprint,
      backPrintMockupId: draft.backPrintMockupId,
      backPrintMockupFingerprint: draft.backPrintMockupFingerprint,
      backAiMockupId: draft.backAiMockupId,
      backAiMockupFingerprint: draft.backAiMockupFingerprint,
    },
  } as unknown as Prisma.InputJsonValue;
  const cleanSize = typeof size === "string" && /^(XS|S|M|L|XL|XXL)$/.test(size) ? size : null;

  const snapshot = {
    design,
    ...(cleanSize ? { size: cleanSize } : {}),
    artworkId,
    product: build.draft.product,
    color: build.draft.color,
    fabric: build.draft.fabric,
    quantity,
    placements,
    ...(transform ? { transform } : {}),
  };

  const item = await prisma.wishlistItem.upsert({
    where: { userId_buildId: { userId, buildId: cleanBuildId } },
    create: { userId, buildId: cleanBuildId, ...snapshot },
    update: snapshot,
    select: { id: true },
  });

  revalidatePath("/wishlist");
  return { ok: true, itemId: item.id, inWishlist: true };
}

export async function actionRemoveFromWishlist(
  itemId: string,
): Promise<WishlistActionResult> {
  const userId = await requireUserId("/wishlist");
  const cleanId = typeof itemId === "string" ? itemId.trim().slice(0, 128) : "";
  if (!cleanId) return { ok: false, error: "An item is required." };

  // Ownership is enforced in the filter -- an id belonging to another user
  // simply matches nothing.
  await prisma.wishlistItem.deleteMany({ where: { id: cleanId, userId } });

  revalidatePath("/wishlist");
  return { ok: true, itemId: cleanId, inWishlist: false };
}

// FormData wrapper so a wishlist card's Remove <form action={...}> can call
// this directly without a client component.
export async function actionRemoveFromWishlistForm(formData: FormData): Promise<void> {
  await actionRemoveFromWishlist(String(formData.get("itemId") ?? ""));
}

// Used by the Builder to render the button's initial state. Returns false
// for a signed-out visitor rather than redirecting.
export async function actionIsInWishlist(buildId: string): Promise<boolean> {
  const userId = await getUserId();
  const cleanBuildId = typeof buildId === "string" ? buildId.trim().slice(0, 128) : "";
  if (!userId || !cleanBuildId) return false;
  const row = await prisma.wishlistItem.findUnique({
    where: { userId_buildId: { userId, buildId: cleanBuildId } },
    select: { id: true },
  });
  return Boolean(row);
}

// "Open in Studio" on a wishlist card: starts a NEW build from the saved
// design (product, colour, fabric, quantity, every artwork layer) and opens
// the Studio on it. The original build is never touched, because a Bag or
// Order record may still reference it. The saved artwork files are checked
// first and copied into the new build; a design whose artwork is gone is not
// reopened half-empty. Mockups are not carried over (they belong to the old
// artwork ids) and are regenerated when the customer saves.
export async function actionOpenWishlistItem(formData: FormData): Promise<void> {
  const userId = await requireUserId("/wishlist");
  const itemId = String(formData.get("itemId") ?? "").trim().slice(0, 128);
  const item = itemId
    ? await prisma.wishlistItem.findFirst({
        where: { id: itemId, userId },
        select: { buildId: true, product: true, color: true, fabric: true, quantity: true, size: true, design: true, build: { select: { name: true } } },
      })
    : null;
  if (!item) redirect("/wishlist");

  const design = item.design && typeof item.design === "object" ? (item.design as Record<string, unknown>) : null;
  const layers = normalizeArtworkLayers(design?.layers);
  const size = item.size ? `?size=${encodeURIComponent(item.size)}` : "";

  // Designs saved before layers were stored: nothing to restore, open the
  // original build as it is (read-only use; nothing is written to it).
  if (!layers.length) redirect(`/studio/projects/${item.buildId}/builder${size}`);

  // Every artwork file must still exist.
  const wantedIds = [...new Set(layers.map((layer) => layer.assetId))];
  const sources = await prisma.asset.findMany({
    where: { id: { in: wantedIds }, buildId: item.buildId, artworkData: { not: null } },
    select: {
      id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true, artworkData: true,
      artworkSha256: true, status: true, cropSourceAssetId: true, cropMeta: true,
    },
  });
  if (sources.length !== wantedIds.length) redirect("/wishlist?notice=design-unavailable");

  // A cropped copy keeps its original so the crop can be reopened.
  const cropSourceIds = [...new Set(sources.map((a) => a.cropSourceAssetId).filter((id): id is string => Boolean(id)))];
  const cropSources = cropSourceIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: cropSourceIds }, buildId: item.buildId, artworkData: { not: null } },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true, artworkData: true, artworkSha256: true, status: true, cropSourceAssetId: true, cropMeta: true },
      })
    : [];

  const idMap = new Map<string, string>();
  for (const asset of [...cropSources, ...sources]) idMap.set(asset.id, randomUUID());

  const newBuildId = await prisma.$transaction(async (tx) => {
    const build = await tx.build.create({
      data: {
        userId,
        name: item.build?.name ?? "Untitled",
        status: "ACTIVE",
        draft: {
          create: {
            product: item.product,
            color: item.color,
            fabric: item.fabric as never,
            quantity: item.quantity,
            customNotes: upsertPlacementsInNotes(typeof design?.customNotes === "string" ? design.customNotes : null, layers.map((l) => l.placement)),
          },
        },
      },
      select: { id: true },
    });
    for (const asset of [...cropSources, ...sources]) {
      const newId = idMap.get(asset.id)!;
      await tx.asset.create({
        data: {
          id: newId,
          buildId: build.id,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          uploadedAt: asset.uploadedAt,
          artworkData: asset.artworkData,
          artworkSha256: asset.artworkSha256,
          storageKey: null,
          status: asset.status,
          url: `/api/assets/${newId}/file`,
          ...(asset.cropSourceAssetId && idMap.has(asset.cropSourceAssetId)
            ? { cropSourceAssetId: idMap.get(asset.cropSourceAssetId)!, cropMeta: asset.cropMeta ?? undefined }
            : {}),
        },
      });
    }
    const restored = layers.map((layer) => ({ ...layer, assetId: idMap.get(layer.assetId)! }));
    const first = restored[0];
    await tx.buildDraft.update({
      where: { buildId: build.id },
      data: {
        artworkLayers: restored as unknown as Prisma.InputJsonValue,
        primaryAssetId: first.assetId,
        artworkPlacement: { placement: first.placement, x: first.x, y: first.y, scale: first.scale, rotation: first.rotation } as Prisma.InputJsonValue,
      },
    });
    return build.id;
  });

  revalidatePath("/wishlist");
  redirect(`/studio/projects/${newBuildId}/builder${size}`);
}
