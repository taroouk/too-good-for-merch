// file: src/lib/orders/draft-placements.ts
//
// The print placements an order is PRICED on, taken only from the design saved on the server. The Studio prices the
// placements of the artworks on the shirt, so the saved layers come first; older drafts fall back to the placements
// recorded in the draft notes, then to the default. Nothing a client sends is ever consulted.
// Relative imports on purpose: the payments test harness compiles this module without the app's path aliases.
import { draftArtworkLayers } from "../../studio/artwork-layers";
import { placementsFromCustomNotes, placementsOrDefault, type PlacementKey } from "../../pricing/placements";

export function draftPricedPlacements(draft: {
  artworkLayers?: unknown;
  primaryAssetId?: string | null;
  artworkPlacement?: unknown;
  customNotes?: string | null;
}): PlacementKey[] {
  const layers = draftArtworkLayers(draft);
  if (layers.length) return placementsOrDefault(layers.map((layer) => layer.placement));
  return placementsOrDefault(placementsFromCustomNotes(draft.customNotes));
}
