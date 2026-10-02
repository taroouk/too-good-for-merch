// file: src/studio/artwork-layers.ts
//
// A Studio design can carry up to MAX_ARTWORK_LAYERS artworks, each on its
// own placement (one artwork per placement). A layer is the same
// { placement, assetId, x, y, scale, rotation } the single-artwork flow
// always stored in BuildDraft.artworkPlacement + primaryAssetId -- the
// layered design is persisted in BuildDraft.artworkLayers, while those two
// legacy fields keep mirroring the first layer so every older consumer
// (wishlist, bespoke requests, saved artwork, admin) keeps working.
//
// Front and back are rendered as separate mockups (one per garment side),
// so most helpers here work per side.
//
// Pure and dependency-light (only computeMockupFingerprint, which the
// client already imports) so it is shared verbatim by the Builder, the
// mockup routes, the draft actions and checkout.
import { computeMockupFingerprint } from "./mockup-fingerprint";
import { PLACEMENTS, type PlacementKey } from "../pricing/placements";
import { getPlacementSide } from "./render/placement-config";
import type { GarmentSide } from "./render/types";

export const MAX_ARTWORK_LAYERS = 4;

export type ArtworkLayer = {
  placement: PlacementKey;
  assetId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Accepts anything (persisted JSON, request bodies) and returns a clean
// list: known placements only, one layer per placement (first wins), at
// most MAX_ARTWORK_LAYERS, numeric transform fields defaulted.
export function normalizeArtworkLayers(value: unknown): ArtworkLayer[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const layers: ArtworkLayer[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const placement = item.placement;
    const assetId = item.assetId;
    if (typeof placement !== "string" || !(PLACEMENTS as readonly string[]).includes(placement)) continue;
    if (typeof assetId !== "string" || !assetId.trim()) continue;
    if (seen.has(placement)) continue;
    seen.add(placement);
    layers.push({
      placement: placement as PlacementKey,
      assetId: assetId.trim(),
      x: finite(item.x, 0),
      y: finite(item.y, 0),
      scale: finite(item.scale, 1),
      rotation: finite(item.rotation, 0),
    });
    if (layers.length >= MAX_ARTWORK_LAYERS) break;
  }
  return layers;
}

// The draft's layers: artworkLayers when present, otherwise the single
// legacy artwork (primaryAssetId + artworkPlacement) as a one-layer design.
export function draftArtworkLayers(draft: {
  artworkLayers?: unknown;
  primaryAssetId?: string | null;
  artworkPlacement?: unknown;
}): ArtworkLayer[] {
  const layers = normalizeArtworkLayers(draft.artworkLayers);
  if (layers.length) return layers;
  if (!draft.primaryAssetId) return [];
  const p = (draft.artworkPlacement ?? {}) as Record<string, unknown>;
  return normalizeArtworkLayers([
    {
      placement: typeof p.placement === "string" ? p.placement : "CENTER_FRONT",
      assetId: draft.primaryAssetId,
      x: p.x,
      y: p.y,
      scale: p.scale,
      rotation: p.rotation,
    },
  ]);
}

export function layerSide(layer: Pick<ArtworkLayer, "placement">): GarmentSide {
  return getPlacementSide(layer.placement);
}

export function layersForSide<T extends Pick<ArtworkLayer, "placement">>(layers: T[], side: GarmentSide): T[] {
  return layers.filter((layer) => layerSide(layer) === side);
}

export function sidesWithLayers(layers: Pick<ArtworkLayer, "placement">[]): GarmentSide[] {
  const sides: GarmentSide[] = [];
  if (layers.some((layer) => layerSide(layer) === "front")) sides.push("front");
  if (layers.some((layer) => layerSide(layer) === "back")) sides.push("back");
  return sides;
}

// Fingerprint of one side's design (what a print/AI mockup of that side was
// rendered from). A single layer hashes exactly like the pre-layers
// single-artwork fingerprint, so mockups generated before this existed stay
// fresh for unchanged one-artwork designs. Several layers combine their
// per-layer fingerprints in placement order (order-independent).
export function sideFingerprint(input: {
  layers: ArtworkLayer[];
  product: string | null;
  color: string | null;
  dpi?: number;
}): string | null {
  if (!input.layers.length) return null;
  const perLayer = input.layers
    .map((layer) =>
      computeMockupFingerprint({
        assetId: layer.assetId,
        placement: layer.placement,
        x: layer.x,
        y: layer.y,
        scale: layer.scale,
        product: input.product,
        color: input.color,
        rotation: layer.rotation,
        dpi: input.dpi,
      }),
    )
    .sort();
  if (perLayer.length === 1) return perLayer[0];
  return computeMockupFingerprint({
    assetId: perLayer.join(","),
    placement: "LAYERS",
    x: 0,
    y: 0,
    scale: 1,
    product: input.product,
    color: input.color,
  });
}
