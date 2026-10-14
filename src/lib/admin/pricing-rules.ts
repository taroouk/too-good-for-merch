// Pure validation for quantity-tier pricing rules. The pricing engine
// (src/pricing/engine.ts) picks the matching rule with
// `minQty <= qty <= maxQty ORDER BY minQty DESC LIMIT 1`, so overlapping
// ranges for the same product+fabric silently shadow each other -- the
// admin UI used to allow creating them. These helpers reject overlaps.

export type TierRule = { id?: string; product: string; fabric: string; minQty: number; maxQty: number };

export function findOverlappingRule(rules: TierRule[], candidate: TierRule): TierRule | null {
  for (const rule of rules) {
    if (candidate.id && rule.id === candidate.id) continue;
    if (rule.product !== candidate.product || rule.fabric !== candidate.fabric) continue;
    if (candidate.minQty <= rule.maxQty && rule.minQty <= candidate.maxQty) return rule;
  }
  return null;
}

export const MAX_TIER_QTY = 500;

export function validateTier(input: { minQty: number; maxQty: number; unitPrice: number }): string | null {
  if (!Number.isInteger(input.minQty) || !Number.isInteger(input.maxQty)) return "Quantities must be whole numbers.";
  if (input.minQty < 1) return "Min quantity must be at least 1.";
  if (input.maxQty < input.minQty) return "Max quantity can't be lower than min quantity.";
  if (input.maxQty > MAX_TIER_QTY) return `Max quantity can't exceed ${MAX_TIER_QTY}.`;
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0) return "Unit price must be greater than zero.";
  if (input.unitPrice > 100000) return "Unit price looks too large — check the amount.";
  return null;
}
