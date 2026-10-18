// Customer-facing names for saved designs (bag, wishlist). A build's own name
// is usually unset or the default "Untitled", so fall back to what the design
// actually is: "Fitted T-shirt · Black". Pure and unit tested.

export function labelize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEFAULT_NAMES = /^(untitled|studio build|untitled project)$/i;

export function designTitle(design: { name?: string | null; product?: string | null; color?: string | null }): string {
  const name = design.name?.trim();
  if (name && !DEFAULT_NAMES.test(name)) return name;
  const product = design.product ? `${labelize(design.product)} T-shirt` : "T-shirt";
  return design.color ? `${product} · ${labelize(design.color)}` : product;
}
