"use server";

import { PlacementType, Prisma, ProductType } from "@prisma/client";
import { getKnownFabricKeys } from "src/lib/catalog";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "src/lib/admin/auth";
import { AdminActionError, formNumber, formString, runAdminAction } from "src/lib/admin/action";
import { findOverlappingRule, validateTier } from "src/lib/admin/pricing-rules";
import { safeAdminPath } from "src/lib/admin/action-url";
import { CUSTOMER_PLACEMENTS } from "src/pricing/placements";
import { prisma } from "src/lib/prisma";
import { planGridChanges, type CellEdit } from "src/lib/admin/price-grid";
import { adjustPrice, validateBulkAdjustment, type BulkMode } from "src/lib/admin/bulk-pricing";

const PRICED_PRODUCTS: ProductType[] = [ProductType.FITTED, ProductType.OVERSIZED];
const RETURN_TO = "/admin/pricing";

// Prices are read live by the studio quote, bag, checkout and the admin pages;
// this makes sure no cached render of any of them outlives a price change.
function revalidateEverywherePrices() {
  revalidatePath("/", "layout");
}

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
    revalidateEverywherePrices();
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
    revalidateEverywherePrices();
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
    revalidateEverywherePrices();
    return "Pricing rule deleted.";
  });
}

export async function upsertPlacementPricingRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(safeAdminPath(formData.get("returnTo"), RETURN_TO), async () => {
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
    revalidateEverywherePrices();
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

// Raises or lowers many prices at once (percent or fixed USD), optionally for
// one product/fabric and optionally including the per-placement prices. Every
// new price is rounded to cents and floored at 0.01; the audit entry keeps
// before/after for the first rows so a mistake can be reverted by hand.
export async function bulkAdjustPricingAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(RETURN_TO, async () => {
    const mode = formString(formData, "mode", 10) as BulkMode;
    if (mode !== "percent" && mode !== "fixed") throw new AdminActionError("Choose percent or fixed amount.");
    const amount = formNumber(formData, "amount", "Amount");
    const problem = validateBulkAdjustment(mode, amount);
    if (problem) throw new AdminActionError(problem);

    const product = formString(formData, "product", 40);
    const fabric = formString(formData, "fabric", 40);
    if (product && !PRICED_PRODUCTS.includes(product as ProductType)) throw new AdminActionError("Choose a valid product.");
    if (fabric && !(await getKnownFabricKeys()).has(fabric)) throw new AdminActionError("Choose a valid fabric.");
    const includePlacements = formData.get("includePlacements") === "on";

    const rules = await prisma.pricingRule.findMany({
      where: { ...(product ? { product } : {}), ...(fabric ? { fabric } : {}) },
      select: { id: true, product: true, fabric: true, minQty: true, maxQty: true, unitPrice: true },
    });
    const placementRules = includePlacements
      ? (await prisma.placementPricingRule.findMany({ select: { id: true, placement: true, unitPrice: true } })).filter((rule) => rule.unitPrice > 0 && (CUSTOMER_PLACEMENTS as readonly string[]).includes(rule.placement))
      : [];
    if (!rules.length && !placementRules.length) throw new AdminActionError("No prices match that selection.");

    const ruleChanges = rules.map((rule) => ({ ...rule, next: adjustPrice(rule.unitPrice, mode, amount) }));
    const placementChanges = placementRules.map((rule) => ({ ...rule, next: adjustPrice(rule.unitPrice, mode, amount) }));
    const changed = ruleChanges.filter((c) => c.next !== c.unitPrice).length + placementChanges.filter((c) => c.next !== c.unitPrice).length;
    if (!changed) throw new AdminActionError("That change doesn't alter any price.");

    await prisma.$transaction([
      ...ruleChanges.map((c) => prisma.pricingRule.update({ where: { id: c.id }, data: { unitPrice: c.next } })),
      ...placementChanges.map((c) => prisma.placementPricingRule.update({ where: { id: c.id }, data: { unitPrice: c.next } })),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "PRICES_BULK_ADJUSTED",
          metadata: {
            mode,
            amount,
            product: product || null,
            fabric: fabric || null,
            includePlacements,
            rulesChanged: ruleChanges.length,
            placementsChanged: placementChanges.length,
            sample: [
              ...ruleChanges.map((c) => ({ kind: "tier", label: `${c.product} · ${c.fabric} · ${c.minQty}-${c.maxQty}`, from: c.unitPrice, to: c.next })),
              ...placementChanges.map((c) => ({ kind: "placement", label: c.placement, from: c.unitPrice, to: c.next })),
            ].slice(0, 60),
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidateEverywherePrices();
    return `Updated ${ruleChanges.length} pricing rule${ruleChanges.length === 1 ? "" : "s"}${placementChanges.length ? ` and ${placementChanges.length} placement price${placementChanges.length === 1 ? "" : "s"}` : ""}.`;
  });
}

// Saves every changed cell of the price grid in one go. Each cell is a standard
// quantity range of a product/fabric: a number writes (or updates) the rule for
// that range, a blank goes back to the built-in default price.
export async function savePriceGridAction(formData: FormData) {
  const admin = await requireAdmin();
  return runAdminAction(safeAdminPath(formData.get("returnTo"), RETURN_TO), async () => {
    let edits: CellEdit[];
    try {
      const parsed = JSON.parse(String(formData.get("edits") ?? "[]")) as unknown;
      if (!Array.isArray(parsed) || parsed.length > 500) throw new Error("bad");
      edits = parsed.map((raw) => {
        const row = raw as Record<string, unknown>;
        const price = row.price === null || row.price === "" ? null : Number(row.price);
        return { product: String(row.product ?? ""), fabric: String(row.fabric ?? ""), minQty: Number(row.minQty), maxQty: Number(row.maxQty), price };
      });
    } catch {
      throw new AdminActionError("Couldn't read the price changes. Reload the page and try again.");
    }
    if (!edits.length) throw new AdminActionError("No price changes to save.");

    const knownFabrics = await getKnownFabricKeys();
    for (const edit of edits) {
      if (!PRICED_PRODUCTS.includes(edit.product as ProductType)) throw new AdminActionError("Choose a valid product.");
      if (!knownFabrics.has(edit.fabric)) throw new AdminActionError(`Unknown fabric ${edit.fabric}.`);
    }

    const rules = await prisma.pricingRule.findMany({
      where: { OR: [...new Set(edits.map((edit) => `${edit.product}|${edit.fabric}`))].map((key) => ({ product: key.split("|")[0], fabric: key.split("|")[1] })) },
      select: { id: true, product: true, fabric: true, minQty: true, maxQty: true, unitPrice: true },
    });
    const plan = planGridChanges(rules, edits);
    if (plan.errors.length) throw new AdminActionError(plan.errors.slice(0, 3).join(" "));
    const total = plan.create.length + plan.update.length + plan.remove.length;
    if (!total) return "Nothing changed.";

    await prisma.$transaction([
      ...plan.create.map((data) => prisma.pricingRule.create({ data })),
      ...plan.update.map((change) => prisma.pricingRule.update({ where: { id: change.id }, data: { unitPrice: change.unitPrice } })),
      ...plan.remove.map((change) => prisma.pricingRule.delete({ where: { id: change.id } })),
      prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "PRICE_GRID_SAVED",
          metadata: {
            created: plan.create.length,
            updated: plan.update.length,
            resetToDefault: plan.remove.length,
            changes: [
              ...plan.create.map((c) => ({ kind: "set", label: `${c.product} · ${c.fabric} · ${c.minQty}-${c.maxQty}`, to: c.unitPrice })),
              ...plan.update.map((c) => ({ kind: "update", label: c.label, from: c.from, to: c.unitPrice })),
              ...plan.remove.map((c) => ({ kind: "reset", label: c.label, from: c.unitPrice })),
            ].slice(0, 80),
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidateEverywherePrices();
    return `Saved ${total} price change${total === 1 ? "" : "s"}.`;
  });
}
