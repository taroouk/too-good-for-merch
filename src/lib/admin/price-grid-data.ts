import { prisma } from "src/lib/prisma";
import { getFabricCatalog } from "src/lib/catalog";
import { CATALOG_PRODUCTS } from "src/lib/admin/pricing-health";
import { buildPriceGrid, type GridColumn } from "src/lib/admin/price-grid";
import type { GridColumnMeta } from "src/components/admin/PriceGridEditor";

// Everything the price grid needs: one column per product x fabric in the
// catalog (hidden fabrics included, so they can be priced before activating).
export async function getPriceGridData(): Promise<{ columns: GridColumn[]; meta: GridColumnMeta[] }> {
  const [rules, fabrics] = await Promise.all([
    prisma.pricingRule.findMany({ select: { id: true, product: true, fabric: true, minQty: true, maxQty: true, unitPrice: true } }),
    getFabricCatalog(),
  ]);
  const combos = CATALOG_PRODUCTS.flatMap((product) => fabrics.map((fabric) => ({ product: product.key, fabric: fabric.key })));
  const columns = buildPriceGrid(rules, combos);
  const meta = combos.map((combo): GridColumnMeta => {
    const fabric = fabrics.find((f) => f.key === combo.fabric);
    return {
      product: combo.product === "FITTED" ? "Fitted" : "Oversized",
      fabric: combo.fabric,
      title: fabric?.name ?? combo.fabric,
      subtitle: fabric?.gsm ?? "",
      hidden: fabric ? !fabric.active : false,
    };
  });
  return { columns, meta };
}
