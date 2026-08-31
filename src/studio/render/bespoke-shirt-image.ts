// file: src/studio/render/bespoke-shirt-image.ts
//
// Extracted from BuilderClient.tsx (getBespokeShirtImage) so the Bespoke
// canvas's garment-image selection -- product/color/placement -> which
// template file to show -- is a pure, unit-testable function instead of a
// private component-local one, and so it's no longer a SECOND, hand-copied
// mapping of the same template files getGarmentTemplate already owns.
//
// The old version duplicated TEMPLATE_FILES's file-per-(product,color,side)
// table with its own if/else chain (same filenames, typed out a second
// time). Delegating to getGarmentTemplate/getPlacementSide instead means
// there is exactly one place that maps (product, color, side) -> a garment
// PNG -- if that table is ever updated, this can't silently drift out of
// sync the way a hand-copied second table could.
//
// No server-only imports (no node:fs, no sharp) -- safe to import directly
// from a client component, same as placement-css.ts. Deliberately not
// re-exported from index.ts (that barrel also re-exports templates.ts,
// which does node:fs/promises I/O).
import type { GarmentColor, ProductType } from "@prisma/client";
import { getGarmentTemplate, getPlacementSide } from "./placement-config";
import type { PlacementType } from "@prisma/client";

// Bespoke ("CUSTOM") has no product/colour of its own yet -- that's the
// whole point of it being a tailored request -- so the Bespoke canvas needs
// SOME concrete garment photo to preview against. Resolves the same way
// resolveMockupProduct/resolveMockupColor (BuilderClient.tsx) resolve it
// for actual mockup generation: anything not literally "OVERSIZED"/"BLACK"
// renders as FITTED/WHITE. product/color are typed loosely (string | null)
// here so this accepts BuilderClient's PlacementKey/DraftDTO fields
// directly without a cast at the call site.
export function getBespokeShirtImage(
  product: string | null,
  color: string | null,
  placement: PlacementType,
): string {
  const side = getPlacementSide(placement);
  const resolvedProduct: ProductType = product === "OVERSIZED" ? "OVERSIZED" : "FITTED";
  const resolvedColor: GarmentColor = color === "BLACK" ? "BLACK" : "WHITE";
  const template = getGarmentTemplate(resolvedProduct, resolvedColor, side);
  return `/images/${template.file}`;
}
