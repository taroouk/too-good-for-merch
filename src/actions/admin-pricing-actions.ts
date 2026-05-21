"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";

async function requireAdmin() {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== Role.ADMIN) {
    redirect("/login");
  }

  return session.user;
}

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function readNumber(formData: FormData, key: string): number {
  const value = Number(formData.get(key));

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${key}.`);
  }

  return value;
}

export async function createPricingRuleAction(formData: FormData) {
  await requireAdmin();

  const product = readString(formData, "product");
  const fabric = readString(formData, "fabric");
  const minQty = Math.floor(readNumber(formData, "minQty"));
  const maxQty = Math.floor(readNumber(formData, "maxQty"));
  const unitPrice = readNumber(formData, "unitPrice");

  if (!product || !fabric) {
    throw new Error("Product and fabric are required.");
  }

  if (minQty < 1 || maxQty < minQty) {
    throw new Error("Invalid quantity range.");
  }

  if (unitPrice <= 0) {
    throw new Error("Unit price must be greater than zero.");
  }

  await prisma.pricingRule.create({
    data: {
      product,
      fabric,
      minQty,
      maxQty,
      unitPrice,
    },
  });

  revalidatePath("/admin/pricing");
}

export async function deletePricingRuleAction(formData: FormData) {
  await requireAdmin();

  const id = readString(formData, "id");

  if (!id) {
    throw new Error("Missing pricing rule id.");
  }

  await prisma.pricingRule.delete({
    where: { id },
  });

  revalidatePath("/admin/pricing");
}