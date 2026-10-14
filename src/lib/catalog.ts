import { prisma } from "src/lib/prisma";
import { DEFAULT_FABRICS, DEFAULT_PRODUCT_COPY, type FabricOption, type ProductCopy } from "src/lib/catalog-shared";

export type CatalogFabricRow = FabricOption & { id: string | null; sortOrder: number; active: boolean };

// Reads fail OPEN to the built-in defaults: a missing table (migration not
// yet applied) or a transient DB error must never take the Studio or
// checkout down.
export async function getFabricCatalog(): Promise<CatalogFabricRow[]> {
  try {
    const rows = await prisma.catalogFabric.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    if (rows.length === 0) return DEFAULT_FABRICS.map((fabric) => ({ ...fabric, id: null, active: true }));
    return rows.map((row) => ({ id: row.id, key: row.key, name: row.name, gsm: row.gsm, desc: row.description, sortOrder: row.sortOrder, active: row.active }));
  } catch {
    return DEFAULT_FABRICS.map((fabric) => ({ ...fabric, id: null, active: true }));
  }
}

export async function getActiveFabricOptions(): Promise<FabricOption[]> {
  return (await getFabricCatalog()).filter((fabric) => fabric.active).map(({ key, name, gsm, desc }) => ({ key, name, gsm, desc }));
}

// Every key the catalog knows (active or not) -- used to validate input.
// Deactivating a fabric hides it and blocks purchase (see computePrice) but
// must not make existing drafts/orders that reference it "invalid".
export async function getKnownFabricKeys(): Promise<Set<string>> {
  return new Set((await getFabricCatalog()).map((fabric) => fabric.key));
}

export async function getProductCopy(): Promise<Record<"FITTED" | "OVERSIZED", ProductCopy>> {
  const copy = { ...DEFAULT_PRODUCT_COPY };
  try {
    const rows = await prisma.catalogProduct.findMany();
    for (const row of rows) {
      if (row.product === "FITTED" || row.product === "OVERSIZED") copy[row.product] = { name: row.name, tagline: row.tagline };
    }
  } catch {
    /* defaults */
  }
  return copy;
}
