// Pure builder for the immutable Builder-state snapshot stored on a
// BespokeRequest at intake time. Keeps the "what did the customer actually
// ask for" payload in one testable place -- see
// src/lib/bespoke/__tests__/snapshot.test.ts. Prisma enum columns accept
// these string literals directly; the calling server action casts.
import { randomBytes } from "node:crypto";
// Relative imports on purpose: this module is compiled + run as plain JS by
// the pure test runner (scripts/run-payments-tests.mjs), which cannot
// resolve the "src/*" baseUrl alias at runtime.
import {
  normalizePlacements,
  placementsFromCustomNotes,
  placementsOrDefault,
} from "../../pricing/placements";
import { normalizeArtworkPlacement } from "../artwork/save";

export type BespokeDraftLike = {
  product: string | null;
  color: string | null;
  fabric: string | null;
  quantity: number | null;
  customNotes: string | null;
  artworkPlacement: unknown;
};

export type BespokeContact = { name: string; email: string; phone: string };

export type BespokeSnapshot = {
  product: string | null;
  color: string | null;
  fabric: string | null;
  quantity: number;
  size: string | null;
  placements: string[];
  transform: ReturnType<typeof normalizeArtworkPlacement>;
  customNotes: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  artworkId: string | null;
};

const SIZES = new Set(["S", "M", "L", "XL"]);

export function normalizeSize(value: unknown): string | null {
  return typeof value === "string" && SIZES.has(value) ? value : null;
}

export function buildRequestSnapshot(input: {
  draft: BespokeDraftLike;
  contact: BespokeContact;
  size?: unknown;
  artworkId: string | null;
  requestedPlacements?: unknown;
}): BespokeSnapshot {
  const { draft, contact } = input;
  const requested = normalizePlacements(input.requestedPlacements);
  const fromNotes = placementsFromCustomNotes(draft.customNotes);
  const placements = placementsOrDefault(requested.length ? requested : fromNotes);

  const quantity = Number.isFinite(Number(draft.quantity))
    ? Math.max(1, Math.min(9999, Math.round(Number(draft.quantity))))
    : 1;

  return {
    product: draft.product ?? null,
    color: draft.color ?? null,
    fabric: draft.fabric ?? null,
    quantity,
    size: normalizeSize(input.size),
    placements,
    transform: normalizeArtworkPlacement(draft.artworkPlacement),
    customNotes: draft.customNotes ? draft.customNotes.slice(0, 2000) : null,
    customerName: contact.name,
    customerEmail: contact.email,
    customerPhone: contact.phone,
    artworkId: input.artworkId,
  };
}

export function generateRequestNumber(now: number = Date.now()): string {
  return `TGFM-BSPK-${now.toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}
