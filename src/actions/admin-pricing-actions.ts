"use server";

import { FabricType, Prisma, ProductType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "src/lib/admin/auth";
import { prisma } from "src/lib/prisma";

function readString(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function readNumber(formData: FormData, key: string) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value)) throw new Error(`Invalid ${key}.`);
  return value;
}

const PRICED_PRODUCTS: ProductType[] = [ProductType.FITTED, ProductType.OVERSIZED];

export async function createPricingRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  const product = readString(formData, "product");
  const fabric = readString(formData, "fabric");
  const minQty = Math.floor(readNumber(formData, "minQty"));
  const maxQty = Math.floor(readNumber(formData, "maxQty"));
  const unitPrice = readNumber(formData, "unitPrice");
  if (
    !PRICED_PRODUCTS.includes(product as ProductType) ||
    !Object.values(FabricType).includes(fabric as FabricType) ||
    minQty < 1 ||
    maxQty < minQty ||
    maxQty > 500 ||
    unitPrice <= 0
  ) throw new Error("Invalid pricing rule.");
  await prisma.$transaction([
    prisma.pricingRule.create({ data: { product, fabric, minQty, maxQty, unitPrice } }),
    prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "PRICING_RULE_CREATED", metadata: { product, fabric, minQty, maxQty, unitPrice } as Prisma.InputJsonValue } }),
  ]);
  revalidatePath("/admin/pricing");
  redirect(`/admin/pricing?notice=${encodeURIComponent("Pricing rule created.")}`);
}

export async function deletePricingRuleAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = readString(formData, "id");
  if (!id) throw new Error("Missing pricing rule id.");
  const rule = await prisma.pricingRule.findUnique({ where: { id } });
  if (!rule) throw new Error("Pricing rule not found.");
  await prisma.$transaction([
    prisma.pricingRule.delete({ where: { id } }),
    prisma.adminAuditLog.create({ data: { adminId: admin.id, action: "PRICING_RULE_DELETED", metadata: { ruleId: id, product: rule.product, fabric: rule.fabric } as Prisma.InputJsonValue } }),
  ]);
  revalidatePath("/admin/pricing");
  redirect(`/admin/pricing?notice=${encodeURIComponent("Pricing rule deleted.")}`);
}
