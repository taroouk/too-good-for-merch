// Pure resolver for persisting the EXACT generated artwork the customer
// SAVEs in the Studio model. Given the build draft + its source
// Mockup(kind="AI") row, it produces the prisma.artwork.upsert() arguments
// -- keyed on sourceMockupId so re-saving the same generation UPSERTs one
// canonical Artwork row instead of ever creating a duplicate. No
// re-render, no Gemini call: the bytes are copied verbatim from the
// mockup. Unit-tested in src/lib/artwork/__tests__/save.test.ts.
import { createHash } from "node:crypto";
// Relative import on purpose: this module is compiled + run as plain JS by
// the pure test runner (scripts/run-payments-tests.mjs), which cannot
// resolve the "src/*" baseUrl alias at runtime.
import { TRANSFORM_BOUNDS } from "../../studio/render/transform";

export class ArtworkSaveError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ArtworkSaveError";
  }
}

export type SavableMockup = {
  id: string;
  mimeType: string | null;
  data: Uint8Array;
  model?: string | null;
  prompt?: string | null;
};

type ArtworkWriteData = {
  userId: string | null;
  buildId: string | null;
  mimeType: string;
  data: Buffer;
  sha256: string;
  model: string | null;
  prompt: string | null;
};

export type ArtworkUpsertArgs = {
  where: { sourceMockupId: string };
  create: ArtworkWriteData & { sourceMockupId: string };
  update: ArtworkWriteData;
};

export function artworkFileUrl(id: string): string {
  return `/api/artworks/${id}/file`;
}

export function resolveArtworkUpsert(input: {
  userId: string | null;
  buildId: string | null;
  mockup: SavableMockup | null | undefined;
}): ArtworkUpsertArgs {
  const { userId, buildId, mockup } = input;
  if (!mockup || !mockup.id) {
    throw new ArtworkSaveError("Generate an AI mockup before saving your artwork.");
  }
  if (!mockup.data || mockup.data.byteLength === 0) {
    throw new ArtworkSaveError("The generated mockup has no image data to save.");
  }

  const data = Buffer.from(mockup.data);
  const mimeType = (mockup.mimeType && mockup.mimeType.trim()) || "image/jpeg";
  const sha256 = createHash("sha256").update(data).digest("hex");
  const model = mockup.model ?? null;
  const prompt = mockup.prompt ? mockup.prompt.slice(0, 4000) : null;

  const common: ArtworkWriteData = { userId, buildId, mimeType, data, sha256, model, prompt };
  return {
    where: { sourceMockupId: mockup.id },
    create: { ...common, sourceMockupId: mockup.id },
    update: { ...common },
  };
}

// Normalises the free-form canvas transform (client-supplied or read back
// from BuildDraft.artworkPlacement) into a stable JSON shape. Kept
// separate from the artwork bytes on purpose -- see schema comment on
// BuildDraft.artworkPlacement and the Sharp compositor, which still takes
// transform numbers per request.
export type ArtworkPlacement = {
  placement: string | null;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

// Bounds-checked against src/studio/render/transform.ts's TRANSFORM_BOUNDS
// -- the same contract the renderer enforces -- so a value that would
// later be rejected by validateTransform() can never be written to
// BuildDraft.artworkPlacement in the first place. A non-finite/missing
// field falls back to its identity default (0 for x/y/rotation, 1 for
// scale); a finite but out-of-range field is clamped into bounds rather
// than thrown, so malformed legacy data read back from the DB degrades to
// a safe in-range value instead of bricking the builder.
function boundedNumber(n: unknown, fallback: number, bounds: { min: number; max: number }): number {
  const value = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

export function normalizeArtworkPlacement(value: unknown): ArtworkPlacement | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const placement = typeof v.placement === "string" ? v.placement : null;
  return {
    placement,
    x: boundedNumber(v.x, 0, TRANSFORM_BOUNDS.x),
    y: boundedNumber(v.y, 0, TRANSFORM_BOUNDS.y),
    scale: boundedNumber(v.scale, 1, TRANSFORM_BOUNDS.scale),
    rotation: boundedNumber(v.rotation, 0, TRANSFORM_BOUNDS.rotation),
  };
}
