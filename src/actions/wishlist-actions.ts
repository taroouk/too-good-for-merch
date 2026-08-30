// file: src/actions/wishlist-actions.ts
"use server";

import { revalidatePath } from "next/cache";
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
export async function actionAddToWishlist(buildId: string): Promise<WishlistActionResult> {
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

  const snapshot = {
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
