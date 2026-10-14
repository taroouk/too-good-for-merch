"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "src/lib/prisma";
import { requireUserId } from "src/studio/authz";
import { canAccessBuild } from "src/studio/permissions";
import { MAX_BAG_ITEMS, normalizeBagSize } from "src/lib/bag";

export type BagActionResult = { ok: true; count: number } | { ok: false; error: string };

// "Add to Bag" in the Builder. One row per (user, build): adding the same
// build again just refreshes the size instead of duplicating it.
export async function actionAddToBag(buildId: string, size: string): Promise<BagActionResult> {
  const cleanBuildId = typeof buildId === "string" ? buildId.trim().slice(0, 128) : "";
  const userId = await requireUserId(`/studio/projects/${cleanBuildId}/builder`);
  if (!cleanBuildId) return { ok: false, error: "A build is required." };

  const build = await prisma.build.findUnique({
    where: { id: cleanBuildId },
    select: { id: true, userId: true, draft: { select: { product: true, color: true, fabric: true } } },
  });
  if (!build?.draft) return { ok: false, error: "Build not found." };
  if (!(await canAccessBuild(userId, build))) return { ok: false, error: "You cannot add this build to your bag." };
  const { product, color, fabric } = build.draft;
  if (!product || !color || !fabric) return { ok: false, error: "Complete your product selection first." };
  if (product === "CUSTOM") return { ok: false, error: "Bespoke builds are submitted as a request, not added to the bag." };

  const existing = await prisma.bagItem.findUnique({ where: { userId_buildId: { userId, buildId: cleanBuildId } }, select: { id: true } });
  if (!existing && (await prisma.bagItem.count({ where: { userId } })) >= MAX_BAG_ITEMS) {
    return { ok: false, error: `Your bag is full (${MAX_BAG_ITEMS} items). Remove something first.` };
  }

  // A guest build becomes the signed-in customer's, same as the wishlist.
  if (!build.userId) await prisma.build.update({ where: { id: cleanBuildId }, data: { userId } });

  await prisma.bagItem.upsert({
    where: { userId_buildId: { userId, buildId: cleanBuildId } },
    update: { size: normalizeBagSize(size) },
    create: { userId, buildId: cleanBuildId, size: normalizeBagSize(size) },
  });
  revalidatePath("/bag");
  return { ok: true, count: await prisma.bagItem.count({ where: { userId } }) };
}

export async function actionRemoveFromBagForm(formData: FormData): Promise<void> {
  const userId = await requireUserId("/bag");
  const itemId = String(formData.get("itemId") ?? "").slice(0, 128);
  if (!itemId) return;
  // Scoped to the owner so one customer can't delete another's item.
  await prisma.bagItem.deleteMany({ where: { id: itemId, userId } });
  revalidatePath("/bag");
}
