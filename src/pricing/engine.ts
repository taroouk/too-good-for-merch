import { prisma } from "src/lib/prisma";

export type PriceResult =
  | {
      mode: "standard";
      unit: number;
      total: number;
      currency: "USD";
    }
  | {
      mode: "custom" | "bulk";
      unit: null;
      total: null;
      currency: "USD";
      message: string;
    };

export async function computePrice({
  product,
  fabric,
  quantity,
}: {
  product: string | null;
  fabric: string | null;
  quantity: number;
}): Promise<PriceResult> {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));

  if (product === "CUSTOM") {
    return {
      mode: "custom",
      unit: null,
      total: null,
      currency: "USD",
      message: "Custom garments require a tailored quote.",
    };
  }

  if (qty >= 501) {
    return {
      mode: "bulk",
      unit: null,
      total: null,
      currency: "USD",
      message: "We will contact you for pricing",
    };
  }

  if (!product || !fabric) {
    return {
      mode: "custom",
      unit: null,
      total: null,
      currency: "USD",
      message: "Select product and fabric",
    };
  }

  try {
    const rule = await prisma.pricingRule.findFirst({
      where: {
        product,
        fabric,
        minQty: { lte: qty },
        maxQty: { gte: qty },
      },
      orderBy: {
        minQty: "asc",
      },
    });

    if (!rule) {
      return {
        mode: "custom",
        unit: null,
        total: null,
        currency: "USD",
        message: "No pricing found",
      };
    }

    return {
      mode: "standard",
      unit: rule.unitPrice,
      total: rule.unitPrice * qty,
      currency: "USD",
    };
  } catch {
    return {
      mode: "custom",
      unit: null,
      total: null,
      currency: "USD",
      message: "Pricing error",
    };
  }
}