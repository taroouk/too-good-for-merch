// file: src/actions/wishlist-actions.ts
"use server";

import { revalidatePath } from "next/cache";
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

// "Open in Studio" on a wishlist card: puts the saved design back on its
// build (product, colour, fabric, quantity, every artwork layer and the
// mockups) and opens the Studio on it.
export async function actionOpenWishlistItem(formData: FormData): Promise<void> {
  const userId = await requireUserId("/wishlist");
  const itemId = String(formData.get("itemId") ?? "").trim().slice(0, 128);
  const item = itemId
    ? await prisma.wishlistItem.findFirst({
        where: { id: itemId, userId },
        select: { buildId: true, product: true, color: true, fabric: true, quantity: true, size: true, design: true },
      })
    : null;
  if (!item) redirect("/wishlist");

  const design = item.design && typeof item.design === "object" ? (item.design as Record<string, unknown>) : null;
  const layers = normalizeArtworkLayers(design?.layers);
  if (design && layers.length) {
    const mockups = (design.mockups && typeof design.mockups === "object" ? design.mockups : {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" && value ? value : null);
    const first = layers[0];
    const placements = layers.map((layer) => layer.placement);
    const notes = upsertPlacementsInNotes(text(design.customNotes), placements);
    await prisma.buildDraft
      .update({
        where: { buildId: item.buildId },
        data: {
          product: item.product,
          color: item.color,
          fabric: item.fabric as never,
          quantity: item.quantity,
          customNotes: notes,
          artworkLayers: layers as unknown as Prisma.InputJsonValue,
          primaryAssetId: first.assetId,
          artworkPlacement: { placement: first.placement, x: first.x, y: first.y, scale: first.scale, rotation: first.rotation } as Prisma.InputJsonValue,
          printMockupId: text(mockups.printMockupId),
          printMockupFingerprint: text(mockups.printMockupFingerprint),
          aiMockupId: text(mockups.aiMockupId),
          aiMockupFingerprint: text(mockups.aiMockupFingerprint),
          backPrintMockupId: text(mockups.backPrintMockupId),
          backPrintMockupFingerprint: text(mockups.backPrintMockupFingerprint),
          backAiMockupId: text(mockups.backAiMockupId),
          backAiMockupFingerprint: text(mockups.backAiMockupFingerprint),
        },
      })
      .catch((error) => console.error("[wishlist] Could not restore the saved design", error));
  }

  const size = item.size ? `?size=${encodeURIComponent(item.size)}` : "";
  redirect(`/studio/projects/${item.buildId}/builder${size}`);
}
