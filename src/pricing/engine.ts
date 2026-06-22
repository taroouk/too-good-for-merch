import { prisma } from "src/lib/prisma";

export type PriceResult =
  | { mode: "standard"; unit: number; total: number; currency: string }
  | {
      mode: "custom" | "bulk";
      unit: null;
      total: null;
      currency: string;
      message: string;
    };

const RANGES = [
  [1, 10], [11, 30], [31, 50], [51, 80], [81, 100],
  [101, 150], [151, 200], [201, 300], [301, 400], [401, 500],
] as const;

const FALLBACK_PRICES: Record<string, Record<string, number[]>> = {
  FITTED: {
    ESSENTIALS_170: [8.02, 7.83, 7.44, 7.25, 6.87, 6.49, 5.92, 5.54, 4.96, 4.58],
    SIGNATURE_200: [9.54, 9.16, 8.4, 7.83, 7.25, 6.87, 6.3, 5.92, 5.34, 4.96],
  },
  OVERSIZED: {
    ESSENTIALS_170: [8.4, 8.21, 7.83, 7.64, 7.25, 6.87, 6.3, 5.92, 5.34, 4.96],
    SIGNATURE_200: [9.93, 9.54, 8.78, 8.21, 7.64, 7.25, 6.68, 6.3, 5.73, 5.34],
    HEAVYWEIGHT_300: [12.41, 11.07, 10.31, 9.73, 9.16, 8.78, 8.21, 7.83, 7.25, 6.87],
  },
};

function storeCurrency() {
  const value = (process.env.STORE_CURRENCY ?? "USD").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : "USD";
}

export async function computePrice({
  product,
  fabric,
  quantity,
}: {
  product: string | null;
  fabric: string | null;
  quantity: number;
}): Promise<PriceResult> {
  const currency = storeCurrency();
  const qty = Math.max(1, Math.min(500, Math.floor(Number(quantity) || 1)));

  if (product === "CUSTOM") {
    return { mode: "custom", unit: null, total: null, currency, message: "Custom garments require a tailored quote." };
  }
  if (quantity >= 501) {
    return { mode: "bulk", unit: null, total: null, currency, message: "We will contact you for pricing" };
  }
  if (!product || !fabric) {
    return { mode: "custom", unit: null, total: null, currency, message: "Select product and fabric" };
  }

  const rule = await prisma.pricingRule.findFirst({
    where: { product, fabric, minQty: { lte: qty }, maxQty: { gte: qty } },
    orderBy: { minQty: "desc" },
  }).catch(() => null);

  const rangeIndex = RANGES.findIndex(([min, max]) => qty >= min && qty <= max);
  const unit = rule?.unitPrice ?? FALLBACK_PRICES[product]?.[fabric]?.[rangeIndex];

  if (!unit || !Number.isFinite(unit) || unit <= 0) {
    return { mode: "custom", unit: null, total: null, currency, message: "No pricing found" };
  }

  return {
    mode: "standard",
    unit: Number(unit.toFixed(2)),
    total: Number((unit * qty).toFixed(2)),
    currency,
  };
}
