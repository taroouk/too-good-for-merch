// Pure model behind the admin price grid (Pricing page + dashboard): one
// column per product/fabric, one row per standard quantity range, every cell
// the price a customer would actually be charged for that range -- a custom
// PricingRule if one exists, otherwise the built-in default
// (src/pricing/defaults.ts). Editing a cell writes/updates a rule for exactly
// that range; clearing it goes back to the default. DB-free and unit tested.
import { FALLBACK_PRICES, RANGES } from "../../pricing/defaults";
import { MAX_TIER_QTY } from "./pricing-rules";

export type GridRule = { id: string; product: string; fabric: string; minQty: number; maxQty: number; unitPrice: number };
export type GridCombo = { product: string; fabric: string };

export type GridCell = {
  minQty: number;
  maxQty: number;
  // What a customer pays per unit for this range right now (null = not priced).
  price: number | null;
  source: "custom" | "default" | "none";
  ruleId: string | null;
  defaultPrice: number | null;
};

export type GridColumn = GridCombo & {
  // False when this combo has tiers that don't match the standard ranges (set
  // up on the advanced tiers list); the grid shows them but doesn't edit them.
  editable: boolean;
  cells: GridCell[];
};

export const MAX_PRICE = 100000;

const sameRange = (rule: GridRule, min: number, max: number) => rule.minQty === min && rule.maxQty === max;

export function defaultPrice(product: string, fabric: string, rangeIndex: number): number | null {
  const value = FALLBACK_PRICES[product]?.[fabric]?.[rangeIndex];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function buildPriceGrid(rules: GridRule[], combos: GridCombo[]): GridColumn[] {
  return combos.map((combo) => {
    const own = rules.filter((rule) => rule.product === combo.product && rule.fabric === combo.fabric);
    const editable = own.every((rule) => RANGES.some(([min, max]) => sameRange(rule, min, max)));
    const cells = RANGES.map(([min, max], index): GridCell => {
      const fallback = defaultPrice(combo.product, combo.fabric, index);
      // Same resolution as computePrice: the rule covering this range's lowest
      // quantity wins (highest minQty first), else the built-in default.
      const covering = own.filter((rule) => rule.minQty <= min && rule.maxQty >= min).sort((a, b) => b.minQty - a.minQty)[0];
      if (covering) {
        return { minQty: min, maxQty: max, price: covering.unitPrice, source: "custom", ruleId: sameRange(covering, min, max) ? covering.id : null, defaultPrice: fallback };
      }
      return { minQty: min, maxQty: max, price: fallback, source: fallback != null ? "default" : "none", ruleId: null, defaultPrice: fallback };
    });
    return { ...combo, editable, cells };
  });
}

export type CellEdit = { product: string; fabric: string; minQty: number; maxQty: number; price: number | null };

export type GridPlan = {
  create: Array<{ product: string; fabric: string; minQty: number; maxQty: number; unitPrice: number }>;
  update: Array<{ id: string; unitPrice: number; from: number; label: string }>;
  remove: Array<{ id: string; unitPrice: number; label: string }>;
  errors: string[];
};

const label = (edit: { product: string; fabric: string; minQty: number; maxQty: number }) => `${edit.product} · ${edit.fabric} · ${edit.minQty}-${edit.maxQty}`;

// Turns submitted cell edits into rule changes. A blank price removes that
// range's rule (back to the built-in default); only standard ranges of
// editable combos are accepted, so no change can create overlapping tiers.
export function planGridChanges(rules: GridRule[], edits: CellEdit[]): GridPlan {
  const plan: GridPlan = { create: [], update: [], remove: [], errors: [] };
  const seen = new Set<string>();
  for (const edit of edits) {
    const where = label(edit);
    const key = `${edit.product}|${edit.fabric}|${edit.minQty}|${edit.maxQty}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!RANGES.some(([min, max]) => min === edit.minQty && max === edit.maxQty) || edit.maxQty > MAX_TIER_QTY) {
      plan.errors.push(`${where}: not a standard quantity range.`);
      continue;
    }
    const own = rules.filter((rule) => rule.product === edit.product && rule.fabric === edit.fabric);
    if (!own.every((rule) => RANGES.some(([min, max]) => sameRange(rule, min, max)))) {
      plan.errors.push(`${edit.product} · ${edit.fabric} has custom quantity tiers — edit them on the advanced tiers list.`);
      continue;
    }
    const existing = own.find((rule) => sameRange(rule, edit.minQty, edit.maxQty));

    if (edit.price == null) {
      if (existing) plan.remove.push({ id: existing.id, unitPrice: existing.unitPrice, label: where });
      continue;
    }
    if (!Number.isFinite(edit.price) || edit.price <= 0) {
      plan.errors.push(`${where}: price must be greater than zero.`);
      continue;
    }
    if (edit.price > MAX_PRICE) {
      plan.errors.push(`${where}: price looks too large — check the amount.`);
      continue;
    }
    const price = Math.round(edit.price * 100) / 100;
    if (existing) {
      if (existing.unitPrice !== price) plan.update.push({ id: existing.id, unitPrice: price, from: existing.unitPrice, label: where });
    } else {
      plan.create.push({ product: edit.product, fabric: edit.fabric, minQty: edit.minQty, maxQty: edit.maxQty, unitPrice: price });
    }
  }
  return plan;
}
