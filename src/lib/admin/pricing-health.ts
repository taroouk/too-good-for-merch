import { prisma } from "src/lib/prisma";
import { getFabricCatalog } from "src/lib/catalog";
import { computePrice, PRICING_CURRENCY } from "src/pricing/engine";

// The fixed product/fabric catalog the Studio builder offers -- config
// values, not DB rows (see app/admin/products/page.tsx). Shared here so the
// Dashboard's operational alerts and the Products page's pricing health
// panel compute "is this combo priced?" from the exact same real engine
// call instead of two copies drifting apart.
export const CATALOG_PRODUCTS = [
  { key: "FITTED", name: "Fitted T-Shirt", desc: "Classic silhouette." },
  { key: "OVERSIZED", name: "Oversized T-Shirt", desc: "Relaxed silhouette." },
] as const;

export type PricingCoverageEntry = { product: string; fabric: string; priced: boolean };

export type PricingHealth = {
  coverage: PricingCoverageEntry[];
  pricedCount: number;
  missingCombos: PricingCoverageEntry[];
  // Combinations an admin deliberately paused (CatalogPause) -- not a
  // pricing gap, so they're excluded from missingCombos.
  pausedCombos: Array<{ product: string; fabric: string; reason: string | null }>;
  pricingRuleCount: number;
  lastPricingUpdate: Date | null;
  usdToEgpRate: number | null;
  currency: string;
};

export async function getPricingHealth(): Promise<PricingHealth> {
  const fabrics = (await getFabricCatalog()).filter((fabric) => fabric.active);
  const [pricingRules, settings, pausedCombos] = await Promise.all([
    prisma.pricingRule.findMany({ select: { product: true, fabric: true, updatedAt: true } }),
    prisma.storeSetting.findUnique({ where: { id: "store" } }),
    prisma.catalogPause.findMany({ select: { product: true, fabric: true, reason: true } }),
  ]);
  const isPaused = (entry: { product: string; fabric: string }) => pausedCombos.some((pause) => pause.product === entry.product && pause.fabric === entry.fabric);

  // Reuses the real pricing engine (never re-derives which combos are
  // priced from FALLBACK_PRICES directly) so "has pricing" always means
  // exactly what checkout would actually accept -- a DB PricingRule row or
  // a fallback entry, either one.
  const coverage = await Promise.all(
    CATALOG_PRODUCTS.flatMap((product) =>
      fabrics.map(async (fabric) => ({
        product: product.key,
        fabric: fabric.key,
        priced: (await computePrice({ product: product.key, fabric: fabric.key, quantity: 1 })).mode === "standard",
      })),
    ),
  );

  const missingCombos = coverage.filter((entry) => !entry.priced && !isPaused(entry));
  const lastPricingUpdate = pricingRules.length
    ? new Date(Math.max(...pricingRules.map((rule) => rule.updatedAt.getTime())))
    : null;

  return {
    coverage,
    pricedCount: coverage.length - missingCombos.length - coverage.filter((entry) => !entry.priced && isPaused(entry)).length,
    missingCombos,
    pausedCombos,
    pricingRuleCount: pricingRules.length,
    lastPricingUpdate,
    usdToEgpRate: settings?.usdToEgpRate ?? null,
    currency: PRICING_CURRENCY,
  };
}
