"use server";

import { PlacementType, Prisma, ProductType } from "@prisma/client";
import { getKnownFabricKeys } from "src/lib/catalog";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formNumber, formString, runAdminAction } from "src/lib/admin/action";
import { findOverlappingRule, validateTier } from "src/lib/admin/pricing-rules";
import { prisma } from "src/lib/prisma";

const PRICED_PRODUCTS: ProductType[] = [ProductType.FITTED, ProductType.OVERSIZED];
const RETURN_TO = "/admin/pricing";

async function readTier(formData: FormData) {
  const product = formString(formData, "product", 40);
  const fabric = formString(formData, "fabric", 40);
  const minQty = Math.floor(formNumber(formData, "minQty", "Min quantity"));
  const maxQty = Math.floor(formNumber(formData, "maxQty", "Max quantity"));
  const unitPrice = formNumber(formData, "unitPrice", "Unit price");
  if (!PRICED_PRODUCTS.includes(product as ProductType)) throw new AdminActionError("Choose a valid product.");
  if (!(await getKnownFabricKeys()).has(fabric)) throw new AdminActionError("Choose a valid fabric.");
  const problem = validateTier({ minQty, maxQty, unitPrice });
  if (problem) throw new AdminActionError(problem);
  return { product, fabric, minQty, maxQty, unitPrice };
}

async function assertNoOverlap(tier: { id?: string; product: string; fabric: string; minQty: number; maxQty: number }) {
  const existing = await prisma.pricingRule.findMany({
    where: { product: tier.product, fabric: tier.fabric },
    select: { id: true, product: true, fabric: true, minQty: true, maxQty: true },
  });
  const clash = findOverlappingRule(existing, tier);
  if (clash) {
    throw new AdminActionError(`Quantity range overlaps an existing rule (${clash.minQty}–${clash.maxQty}) for ${tier.product} · ${tier.fabric}. Adjust or edit that rule first.`);
  }
}

export async function createPricingRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const tier = await readTier(formData);
    await assertNoOverlap(tier);
    await prisma.$transaction([
      prisma.pricingRule.create({ data: tier }),
      prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "PRICING_RULE_CREATED", metadata: tier as Prisma.InputJsonValue } }),
    ]);
    revalidatePath(RETURN_TO);
    return "Pricing rule created.";
  });
}

export async function updatePricingRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const id = formString(formData, "id", 100);
    if (!id) throw new AdminActionError("Missing pricing rule id.");
    const previous = await prisma.pricingRule.findUnique({ where: { id } });
    if (!previous) throw new AdminActionError("Pricing rule not found.");
    const tier = await readTier(formData);
    await assertNoOverlap({ ...tier, id });
    await prisma.$transaction([
      prisma.pricingRule.update({ where: { id }, data: tier }),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "PRICING_RULE_UPDATED",
          previousValue: `${previous.minQty}-${previous.maxQty} @ ${previous.unitPrice}`,
          newValue: `${tier.minQty}-${tier.maxQty} @ ${tier.unitPrice}`,
          metadata: { ruleId: id, product: tier.product, fabric: tier.fabric } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidatePath(RETURN_TO);
    return "Pricing rule updated.";
  });
}

export async function deletePricingRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const id = formString(formData, "id", 100);
    if (!id) throw new AdminActionError("Missing pricing rule id.");
    const rule = await prisma.pricingRule.findUnique({ where: { id } });
    if (!rule) throw new AdminActionError("Pricing rule not found.");
    await prisma.$transaction([
      prisma.pricingRule.delete({ where: { id } }),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "PRICING_RULE_DELETED",
          metadata: { ruleId: id, product: rule.product, fabric: rule.fabric, minQty: rule.minQty, maxQty: rule.maxQty, unitPrice: rule.unitPrice } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidatePath(RETURN_TO);
    return "Pricing rule deleted.";
  });
}

export async function upsertPlacementPricingRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const placement = formString(formData, "placement", 40);
    const unitPrice = formNumber(formData, "unitPrice", "Placement price");
    if (!Object.values(PlacementType).includes(placement as PlacementType)) throw new AdminActionError("Choose a valid placement.");
    if (unitPrice < 0 || unitPrice > 100000) throw new AdminActionError("Placement price must be between 0 and 100000.");
    const previous = await prisma.placementPricingRule.findUnique({ where: { placement: placement as PlacementType } });
    await prisma.$transaction([
      prisma.placementPricingRule.upsert({
        where: { placement: placement as PlacementType },
        update: { unitPrice },
        create: { placement: placement as PlacementType, unitPrice },
      }),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "PLACEMENT_PRICING_RULE_SAVED",
          previousValue: previous ? String(previous.unitPrice) : null,
          newValue: String(unitPrice),
          metadata: { placement } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidatePath(RETURN_TO);
    revalidatePath("/admin/products");
    return "Placement pricing saved.";
  });
}

export async function deletePlacementPricingRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const id = formString(formData, "id", 100);
    if (!id) throw new AdminActionError("Missing placement pricing rule id.");
    const rule = await prisma.placementPricingRule.findUnique({ where: { id } });
    if (!rule) throw new AdminActionError("Placement pricing rule not found.");
    await prisma.$transaction([
      prisma.placementPricingRule.delete({ where: { id } }),
      prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "PLACEMENT_PRICING_RULE_DELETED", metadata: { ruleId: id, placement: rule.placement, unitPrice: rule.unitPrice } as Prisma.InputJsonValue } }),
    ]);
    revalidatePath(RETURN_TO);
    revalidatePath("/admin/products");
    return "Placement pricing rule removed.";
  });
}

// --- Catalog availability (pause / resume selling a product + fabric) ------

export async function setCatalogPausedAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction("/admin/products", async () => {
    const product = formString(formData, "product", 40);
    const fabric = formString(formData, "fabric", 40);
    const pause = formString(formData, "pause", 10) === "true";
    const reason = formString(formData, "reason", 140);
    if (!PRICED_PRODUCTS.includes(product as ProductType)) throw new AdminActionError("Choose a valid product.");
    if (!(await getKnownFabricKeys()).has(fabric)) throw new AdminActionError("Choose a valid fabric.");

    if (pause) {
      await prisma.$transaction([
        prisma.catalogPause.upsert({
          where: { product_fabric: { product, fabric } },
          update: { reason: reason || null },
          create: { product, fabric, reason: reason || null },
        }),
        prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "CATALOG_PAUSED", metadata: { product, fabric, reason } as Prisma.InputJsonValue } }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.catalogPause.deleteMany({ where: { product, fabric } }),
        prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "CATALOG_RESUMED", metadata: { product, fabric } as Prisma.InputJsonValue } }),
      ]);
    }
    revalidatePath("/admin/products");
    return pause ? `${product} · ${fabric} paused — customers can't buy it.` : `${product} · ${fabric} is on sale again.`;
  });
}
