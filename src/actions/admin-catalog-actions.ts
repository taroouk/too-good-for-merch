"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formNumber, formString, runAdminAction } from "src/lib/admin/action";
import { DEFAULT_FABRICS, fabricCopyProblem, fabricKeyProblem, productCopyProblem } from "src/lib/catalog-shared";
import { prisma } from "src/lib/prisma";

const RETURN_TO = "/admin/products";

function revalidateCatalog() {
  revalidatePath(RETURN_TO);
  revalidatePath("/admin/pricing");
  revalidatePath("/admin");
}

export async function createFabricAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const key = formString(formData, "key", 40).toUpperCase();
    const name = formString(formData, "name", 40);
    const gsm = formString(formData, "gsm", 40);
    const description = formString(formData, "description", 300);
    const keyProblem = fabricKeyProblem(key);
    if (keyProblem) throw new AdminActionError(keyProblem);
    const copyProblem = fabricCopyProblem({ name, gsm, description });
    if (copyProblem) throw new AdminActionError(copyProblem);
    if (await prisma.catalogFabric.findUnique({ where: { key }, select: { id: true } })) throw new AdminActionError(`A fabric with key ${key} already exists.`);

    const last = await prisma.catalogFabric.aggregate({ _max: { sortOrder: true } });
    await prisma.$transaction([
      // Created INACTIVE: a fabric with no pricing rules would be unsellable
      // ("No pricing found"), so the admin prices it first, then turns it on.
      prisma.catalogFabric.create({ data: { key, name, gsm, description, sortOrder: (last._max.sortOrder ?? 0) + 10, active: false } }),
      prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "FABRIC_CREATED", metadata: { key, name, gsm } as Prisma.InputJsonValue } }),
    ]);
    revalidateCatalog();
    return `${name} added (inactive). Add its prices on the Pricing page, then activate it here.`;
  });
}

export async function updateFabricAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const id = formString(formData, "id", 100);
    const name = formString(formData, "name", 40);
    const gsm = formString(formData, "gsm", 40);
    const description = formString(formData, "description", 300);
    const sortOrder = Math.round(formNumber(formData, "sortOrder", "Sort order"));
    const previous = await prisma.catalogFabric.findUnique({ where: { id } });
    if (!previous) throw new AdminActionError("Fabric not found.");
    const copyProblem = fabricCopyProblem({ name, gsm, description });
    if (copyProblem) throw new AdminActionError(copyProblem);
    if (sortOrder < 0 || sortOrder > 100000) throw new AdminActionError("Sort order must be between 0 and 100000.");
    await prisma.$transaction([
      prisma.catalogFabric.update({ where: { id }, data: { name, gsm, description, sortOrder } }),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "FABRIC_UPDATED",
          previousValue: `${previous.name} | ${previous.gsm}`,
          newValue: `${name} | ${gsm}`,
          metadata: { key: previous.key } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidateCatalog();
    return `${name} updated.`;
  });
}

export async function setFabricActiveAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const id = formString(formData, "id", 100);
    const active = formString(formData, "active", 10) === "true";
    const fabric = await prisma.catalogFabric.findUnique({ where: { id } });
    if (!fabric) throw new AdminActionError("Fabric not found.");
    if (active && (await prisma.pricingRule.count({ where: { fabric: fabric.key } })) === 0) {
      // Seeded fabrics are priced by engine fallbacks, so only warn-block
      // fabrics that have neither a DB rule nor a built-in fallback.
      if (!DEFAULT_FABRICS.some((builtin) => builtin.key === fabric.key)) {
        throw new AdminActionError(`${fabric.name} has no pricing rules yet — add its prices on the Pricing page before activating it.`);
      }
    }
    if (!active && (await prisma.catalogFabric.count({ where: { active: true, id: { not: id } } })) === 0) {
      throw new AdminActionError("You can't deactivate the last active fabric — customers would have nothing to choose.");
    }
    await prisma.$transaction([
      prisma.catalogFabric.update({ where: { id }, data: { active } }),
      prisma.adminAuditLog.create({ data: { adminId: admin.id, action: active ? "FABRIC_ACTIVATED" : "FABRIC_DEACTIVATED", metadata: { key: fabric.key } as Prisma.InputJsonValue } }),
    ]);
    revalidateCatalog();
    return active ? `${fabric.name} is now offered to customers.` : `${fabric.name} hidden and can no longer be bought.`;
  });
}

export async function deleteFabricAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const id = formString(formData, "id", 100);
    const fabric = await prisma.catalogFabric.findUnique({ where: { id } });
    if (!fabric) throw new AdminActionError("Fabric not found.");
    const [rules, drafts, items, wishlist, bespoke, pauses] = await Promise.all([
      prisma.pricingRule.count({ where: { fabric: fabric.key } }),
      prisma.buildDraft.count({ where: { fabric: fabric.key } }),
      prisma.orderItem.count({ where: { fabric: fabric.key } }),
      prisma.wishlistItem.count({ where: { fabric: fabric.key } }),
      prisma.bespokeRequest.count({ where: { fabric: fabric.key } }),
      prisma.catalogPause.count({ where: { fabric: fabric.key } }),
    ]);
    const used = [rules && `${rules} pricing rule(s)`, drafts && `${drafts} project(s)`, items && `${items} order item(s)`, wishlist && `${wishlist} wishlist item(s)`, bespoke && `${bespoke} bespoke request(s)`, pauses && `${pauses} pause(s)`].filter(Boolean);
    if (used.length) throw new AdminActionError(`${fabric.name} is still referenced by ${used.join(", ")}. Deactivate it instead — deleting would break that history.`);
    if (fabric.active && (await prisma.catalogFabric.count({ where: { active: true, id: { not: id } } })) === 0) {
      throw new AdminActionError("You can't delete the last active fabric.");
    }
    await prisma.$transaction([
      prisma.catalogFabric.delete({ where: { id } }),
      prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "FABRIC_DELETED", metadata: { key: fabric.key, name: fabric.name } as Prisma.InputJsonValue } }),
    ]);
    revalidateCatalog();
    return `${fabric.name} deleted.`;
  });
}

export async function updateProductCopyAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const product = formString(formData, "product", 20);
    const name = formString(formData, "name", 60);
    const tagline = formString(formData, "tagline", 30);
    if (product !== "FITTED" && product !== "OVERSIZED") throw new AdminActionError("Choose a valid product.");
    const problem = productCopyProblem({ name, tagline });
    if (problem) throw new AdminActionError(problem);
    await prisma.$transaction([
      prisma.catalogProduct.upsert({ where: { product }, update: { name, tagline }, create: { product, name, tagline } }),
      prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "PRODUCT_COPY_UPDATED", newValue: `${name} | ${tagline}`, metadata: { product } as Prisma.InputJsonValue } }),
    ]);
    revalidateCatalog();
    revalidatePath("/studio", "layout");
    return `${name} updated.`;
  });
}
