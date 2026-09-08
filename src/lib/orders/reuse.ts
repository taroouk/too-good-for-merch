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

export type DesignSignature = {
  product: string;
  fabric: string;
  color: string;
  quantity: number;
  size: string | null;
  primaryAssetId: string | null;
  placements: string[];
  transform: ArtworkPlacement | null;
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
    transformsMatch(a.transform, b.transform)
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
