// Pure helpers deciding whether a non-terminal Order can be reused for a
// checkout resubmission, vs. must fall through to creating a fresh Order.
// Split out of src/lib/orders/checkout.ts so this decision is unit
// testable without a database (see
// src/lib/orders/__tests__/reuse.test.ts, run by
// scripts/run-payments-tests.mjs).
//
// Price/currency matching alone is NOT sufficient: a customer can change
// artwork, color, or size to a different combination that happens to cost
// the same, and price-only matching would silently let that new design
// reuse (and pay through) an Order record that still describes the old
// one. A reused Order must represent the exact same purchased design --
// same product/fabric/color/quantity/placements/primary artwork/transform
// -- not merely the same price.
// Relative import on purpose: this module is compiled + run as plain JS by
// the pure test runner (scripts/run-payments-tests.mjs), which cannot
// resolve the "src/*" baseUrl alias at runtime.
import type { ArtworkPlacement } from "../artwork/save";

// One artwork of a multi-artwork design (src/studio/artwork-layers.ts --
// structurally identical; not imported so this module stays dependency-free
// for its unit tests).
export type SignatureLayer = {
  placement: string;
  assetId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export type DesignSignature = {
  product: string;
  fabric: string;
  color: string;
  quantity: number;
  size: string | null;
  primaryAssetId: string | null;
  placements: string[];
  transform: ArtworkPlacement | null;
  // Every artwork (multi-artwork designs). Absent on orders placed before
  // layers existed -- those are single-artwork, fully described by
  // primaryAssetId + transform above.
  layers?: SignatureLayer[] | null;
};

export function buildDesignSignature(input: {
  product: string;
  fabric: string;
  color: string;
  quantity: number;
  size: string | null;
  primaryAssetId: string | null;
  placements: string[];
  transform: ArtworkPlacement | null;
  layers?: SignatureLayer[] | null;
}): DesignSignature {
  return {
    product: input.product,
    fabric: input.fabric,
    color: input.color,
    quantity: input.quantity,
    size: input.size,
    primaryAssetId: input.primaryAssetId,
    // Order-independent: two requests naming the same placements in a
    // different order must compare equal.
    placements: [...input.placements].sort(),
    transform: input.transform,
    // Order-independent, like placements.
    layers: input.layers ? [...input.layers].sort((a, b) => a.placement.localeCompare(b.placement)) : null,
  };
}

export function designSignaturesMatch(a: DesignSignature | null, b: DesignSignature): boolean {
  if (!a) return false;
  return (
    a.product === b.product &&
    a.fabric === b.fabric &&
    a.color === b.color &&
    a.quantity === b.quantity &&
    a.size === b.size &&
    a.primaryAssetId === b.primaryAssetId &&
    a.placements.length === b.placements.length &&
    a.placements.every((p, i) => p === b.placements[i]) &&
    transformsMatch(a.transform, b.transform) &&
    layersMatch(a.layers ?? null, b.layers ?? null)
  );
}

// A signature without layers (an order placed before multi-artwork) is a
// single-artwork design whose artwork is already compared through
// primaryAssetId + transform -- it can only match a design of at most one
// layer. Otherwise every layer must match exactly.
function layersMatch(a: SignatureLayer[] | null, b: SignatureLayer[] | null): boolean {
  if (!a || !b) return (a ?? b ?? []).length <= 1;
  if (a.length !== b.length) return false;
  const sorted = (list: SignatureLayer[]) => [...list].sort((x, y) => x.placement.localeCompare(y.placement));
  const [sa, sb] = [sorted(a), sorted(b)];
  return sa.every(
    (layer, i) =>
      layer.placement === sb[i].placement &&
      layer.assetId === sb[i].assetId &&
      layer.x === sb[i].x &&
      layer.y === sb[i].y &&
      layer.scale === sb[i].scale &&
      layer.rotation === sb[i].rotation,
  );
}

function transformsMatch(a: ArtworkPlacement | null, b: ArtworkPlacement | null): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  return (
    a.placement === b.placement &&
    a.x === b.x &&
    a.y === b.y &&
    a.scale === b.scale &&
    a.rotation === b.rotation
  );
}

export function canReuseOrder(params: {
  existing: { currency: string; totalCents: number; existingSignature: DesignSignature | null } | null;
  candidate: { currency: string; totalCents: number; signature: DesignSignature };
}): boolean {
  const { existing, candidate } = params;
  if (!existing) return false;
  return (
    existing.currency === candidate.currency &&
    existing.totalCents === candidate.totalCents &&
    designSignaturesMatch(existing.existingSignature, candidate.signature)
  );
}
