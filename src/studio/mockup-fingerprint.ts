// file: src/studio/mockup-fingerprint.ts
//
// Moved verbatim out of src/db/mockup.ts (which re-exports it) so code that
// must not pull in Prisma -- src/studio/artwork-layers.ts and its unit
// tests -- can compute mockup fingerprints too.
import { createHash } from "node:crypto";

export function computeMockupFingerprint(input: {
  assetId: string | null;
  placement: string;
  x: number;
  y: number;
  scale: number;
  product: string | null;
  color: string | null;
  rotation?: number;
  dpi?: number;
}): string {
  const parts: Array<string | number> = [
    input.assetId ?? "none",
    input.placement,
    // x/y are fractions of the container/template width (see
    // src/studio/render/transform.ts), not raw px -- round to the same
    // decimal precision as scale, not to the nearest integer.
    Math.round(input.x * 1000) / 1000,
    Math.round(input.y * 1000) / 1000,
    Math.round(input.scale * 1000) / 1000,
    input.product ?? "none",
    input.color ?? "none",
  ];

  // rotation/dpi are appended only when the caller provides them, so the
  // hash for callers that don't (the AI mockup flow, which has no dpi
  // concept and no rotation control) stays byte-for-byte identical to
  // before this change -- no AI mockup persistence/API behavior changes.
  // The Print Mockup flow always provides both, since both affect the
  // rendered output and must invalidate the print cache when they change.
  if (input.rotation !== undefined) {
    parts.push(Math.round(input.rotation * 1000) / 1000);
  }
  if (input.dpi !== undefined) {
    parts.push(Math.round(input.dpi));
  }

  const raw = parts.join("|");
  return createHash("sha256").update(raw).digest("hex");
}
