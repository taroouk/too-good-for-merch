// Pure (DB-free) catalog types, defaults and validation. The defaults mirror
// the rows seeded by the 20261012170000_catalog_fabrics_products migration
// and are the fallback when the catalog tables can't be read, so the Studio
// and checkout keep working through a deploy-order gap or a DB blip.

// Fabric keys are free-form strings now (admin-managed), not a Prisma enum.
export type FabricType = string;

export type FabricOption = { key: string; name: string; gsm: string; desc: string };

export const DEFAULT_FABRICS: Array<FabricOption & { sortOrder: number }> = [
  { key: "ESSENTIALS_170", name: "ESSENTIALS", gsm: "170 GSM Cotton", desc: "Lightweight everyday cotton with a clean minimal hand feel.", sortOrder: 10 },
  { key: "SIGNATURE_200", name: "SIGNATURE", gsm: "200 GSM Cotton", desc: "Our balanced premium weight. Smooth, buttery, structured, and designed to hold its shape.", sortOrder: 20 },
  { key: "HEAVYWEIGHT_300", name: "HEAVYWEIGHT", gsm: "300 GSM Cotton", desc: "Dense luxury cotton with elevated structure and a substantial drape.", sortOrder: 30 },
];

export type ProductCopy = { name: string; tagline: string };

export const DEFAULT_PRODUCT_COPY: Record<"FITTED" | "OVERSIZED", ProductCopy> = {
  FITTED: { name: "Fitted T-Shirt", tagline: "Classic" },
  OVERSIZED: { name: "Oversized T-Shirt", tagline: "Relaxed" },
};

// UPPER_SNAKE keys: stable identifiers stored on drafts, order items and
// pricing rules, so they're restricted to a safe, URL/DB-friendly shape.
export function fabricKeyProblem(key: string): string | null {
  if (!/^[A-Z][A-Z0-9_]{2,39}$/.test(key)) return "Key must be 3–40 characters: capital letters, digits and underscores, starting with a letter (e.g. LINEN_180).";
  if (key === "CUSTOM") return "CUSTOM is reserved.";
  return null;
}

export function fabricCopyProblem(input: { name: string; gsm: string; description: string }): string | null {
  if (input.name.trim().length < 2 || input.name.length > 40) return "Name must be 2–40 characters.";
  if (input.gsm.trim().length < 2 || input.gsm.length > 40) return "Weight/GSM label must be 2–40 characters (e.g. 180 GSM Linen).";
  if (input.description.trim().length < 5 || input.description.length > 300) return "Description must be 5–300 characters.";
  return null;
}

export function productCopyProblem(input: { name: string; tagline: string }): string | null {
  if (input.name.trim().length < 2 || input.name.length > 60) return "Name must be 2–60 characters.";
  if (input.tagline.trim().length < 2 || input.tagline.length > 30) return "Tagline must be 2–30 characters.";
  return null;
}
