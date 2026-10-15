"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formString, runAdminAction } from "src/lib/admin/action";
import { safeAdminPath } from "src/lib/admin/action-url";
import { createHash } from "node:crypto";
import { prisma } from "src/lib/prisma";
import { compressMockupImage } from "src/lib/image/compress-mockup";

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

// Re-encodes older full-size artwork images (PNG/JPEG) as compressed WebP,
// 25 per click so a request never runs long. Only artworks of paid orders
// are shown in the admin, so only those are touched.
export async function compressArtworksAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(safeAdminPath(formData.get("returnTo"), "/admin/artworks"), async () => {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT a.id FROM "Artwork" a
      WHERE a."mimeType" <> 'image/webp'
        AND EXISTS (
          SELECT 1 FROM "Order" o
          WHERE o."paymentStatus" = 'PAID'
            AND ((o."buildId" IS NOT NULL AND o."buildId" = a."buildId")
              OR EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o.id AND i.preview ->> 'savedArtworkId' = a.id)))
      ORDER BY a."createdAt" DESC
      LIMIT 25`;
    let shrunk = 0;
    let savedBytes = 0;
    for (const row of rows) {
      const artwork = await prisma.artwork.findUnique({ where: { id: row.id }, select: { data: true, mimeType: true } });
      if (!artwork?.data) continue;
      const original = Buffer.from(artwork.data);
      const result = await compressMockupImage(original, artwork.mimeType);
      if (!result.compressed) continue;
      await prisma.artwork.update({
        where: { id: row.id },
        data: { data: result.data, mimeType: result.mimeType, sha256: createHash("sha256").update(result.data).digest("hex") },
      });
      shrunk += 1;
      savedBytes += original.byteLength - result.data.byteLength;
    }
    if (shrunk) {
      await prisma.adminAuditLog.create({
        data: { adminId: admin.id, action: "ARTWORKS_COMPRESSED", metadata: { count: shrunk, savedBytes } as Prisma.InputJsonValue },
      });
    }
    revalidatePath("/admin/artworks");
    return shrunk
      ? `Compressed ${shrunk} artwork${shrunk === 1 ? "" : "s"}, saving ${(savedBytes / 1024 / 1024).toFixed(1)} MB.`
      : "Nothing left to compress.";
  });
}
