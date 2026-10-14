"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formString, runAdminAction } from "src/lib/admin/action";
import { safeAdminPath } from "src/lib/admin/action-url";
import { prisma } from "src/lib/prisma";

// Moderation delete of a saved Artwork (e.g. inappropriate generated
// content). Wishlist items and studio drafts that pointed at it lose the
// link (the schema nulls it); an artwork attached to a bespoke request is
// part of a business record the admin may be quoting, so it's protected.
export async function deleteArtworkAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(safeAdminPath(formData.get("returnTo"), "/admin/artworks"), async () => {
    const id = formString(formData, "id", 100);
    if (!id) throw new AdminActionError("Missing artwork.");
    const artwork = await prisma.artwork.findUnique({
      where: { id },
      select: { id: true, userId: true, sha256: true, prompt: true, _count: { select: { bespokeRequests: true } } },
    });
    if (!artwork) throw new AdminActionError("Artwork not found — it may already be deleted.");
    if (artwork._count.bespokeRequests > 0) {
      throw new AdminActionError(`This artwork is attached to ${artwork._count.bespokeRequests} bespoke request(s). Close or decline those first.`);
    }
    await prisma.$transaction([
      prisma.artwork.delete({ where: { id } }),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "ARTWORK_DELETED",
          metadata: { artworkId: id, userId: artwork.userId, sha256: artwork.sha256, prompt: artwork.prompt?.slice(0, 200) ?? null } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidatePath("/admin/artworks");
    return "Artwork deleted.";
  });
}
