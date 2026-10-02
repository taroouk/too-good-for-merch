// file: src/db/mockup.ts
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "src/lib/prisma";

export type MockupInput = {
  buildId: string;
  assetId: string | null;
  mimeType: string;
  data: Buffer;
  fingerprint: string;
  model: string | null;
  placement: string | null;
  prompt: string | null;
  // The Print Mockup this AI mockup was generated from -- null only for
  // legacy rows predating the Print Mockup flow.
  parentId?: string | null;
  // Which garment side this mockup shows. The draft's printMockup*/
  // aiMockup* columns are the FRONT (and every pre-layers single-artwork
  // mockup); "back" writes the backPrintMockup*/backAiMockup* columns.
  side?: "front" | "back";
};

export type MockupRecord = {
  id: string;
  url: string;
  mimeType: string;
  createdAt: Date;
};

// Pure (no Prisma) so the Builder and unit tests can use it -- see
// src/studio/mockup-fingerprint.ts.
export { computeMockupFingerprint } from "../studio/mockup-fingerprint";

export async function upsertMockupForDraft(
  draftId: string,
  input: MockupInput,
): Promise<MockupRecord> {
  const id = randomUUID();

  const created = await prisma.mockup.create({
    data: {
      id,
      kind: "AI",
      parentId: input.parentId ?? null,
      buildId: input.buildId,
      assetId: input.assetId,
      mimeType: input.mimeType,
      data: input.data,
      sha256: createHash("sha256").update(input.data).digest("hex"),
      model: input.model,
      placement: input.placement,
      fingerprint: input.fingerprint,
      prompt: input.prompt ? input.prompt.slice(0, 4000) : null,
    },
    select: { id: true, mimeType: true, createdAt: true },
  });

  await prisma.buildDraft.update({
    where: { id: draftId },
    data:
      input.side === "back"
        ? { backAiMockupId: created.id, backAiMockupFingerprint: input.fingerprint }
        : {
            aiMockupId: created.id,
            aiMockupFingerprint: input.fingerprint,
            aiMockupGeneratedAt: created.createdAt,
          },
    select: { id: true },
  });

  return {
    id: created.id,
    url: `/api/mockups/${created.id}/file`,
    mimeType: created.mimeType ?? "image/jpeg",
    createdAt: created.createdAt,
  };
}

export async function clearMockupFromDraft(draftId: string): Promise<void> {
  await prisma.buildDraft.update({
    where: { id: draftId },
    data: {
      aiMockupId: null,
      aiMockupFingerprint: null,
      aiMockupGeneratedAt: null,
    },
    select: { id: true },
  });
}

export async function getDraftMockupUrl(draftId: string): Promise<string | null> {
  const draft = await prisma.buildDraft.findUnique({
    where: { id: draftId },
    select: {
      aiMockupId: true,
      aiMockupFingerprint: true,
      aiMockup: { select: { id: true, mimeType: true } },
    },
  });

  if (!draft?.aiMockupId || !draft.aiMockup) return null;
  return `/api/mockups/${draft.aiMockup.id}/file`;
}

// --- Print Mockup (deterministic compositor) persistence ---
// Kept separate from the AI-mockup functions above rather than merging
// them: nanobanana/route.ts depends on the AI-side functions and stays
// frozen (Rendering Architecture Redesign Phase 1 governance), so Print
// gets its own parallel set of functions instead of a shared, kind-aware
// rewrite of upsertMockupForDraft.

export type PrintMockupInput = MockupInput & {
  width: number;
  height: number;
};

export async function upsertPrintMockup(
  draftId: string,
  input: PrintMockupInput,
): Promise<MockupRecord> {
  const id = randomUUID();

  const created = await prisma.mockup.create({
    data: {
      id,
      kind: "PRINT",
      buildId: input.buildId,
      assetId: input.assetId,
      mimeType: input.mimeType,
      data: input.data,
      width: input.width,
      height: input.height,
      sha256: createHash("sha256").update(input.data).digest("hex"),
      model: input.model,
      placement: input.placement,
      fingerprint: input.fingerprint,
      prompt: input.prompt ? input.prompt.slice(0, 4000) : null,
    },
    select: { id: true, mimeType: true, createdAt: true },
  });

  await prisma.buildDraft.update({
    where: { id: draftId },
    data:
      input.side === "back"
        ? { backPrintMockupId: created.id, backPrintMockupFingerprint: input.fingerprint }
        : {
            printMockupId: created.id,
            printMockupFingerprint: input.fingerprint,
            printMockupGeneratedAt: created.createdAt,
          },
    select: { id: true },
  });

  return {
    id: created.id,
    url: `/api/mockups/${created.id}/file`,
    mimeType: created.mimeType ?? "image/png",
    createdAt: created.createdAt,
  };
}

// Returns the persisted print mockup for a draft only if its fingerprint
// still matches the requested one -- lets the API route skip a re-render
// when nothing relevant has changed since the last generation.
export async function getFreshPrintMockup(
  draftId: string,
  fingerprint: string,
  side: "front" | "back" = "front",
): Promise<MockupRecord | null> {
  if (side === "back") {
    const backDraft = await prisma.buildDraft.findUnique({
      where: { id: draftId },
      select: { backPrintMockupId: true, backPrintMockupFingerprint: true },
    });
    if (!backDraft?.backPrintMockupId || backDraft.backPrintMockupFingerprint !== fingerprint) return null;
    const row = await prisma.mockup.findUnique({
      where: { id: backDraft.backPrintMockupId },
      select: { id: true, mimeType: true, createdAt: true },
    });
    if (!row) return null;
    return { id: row.id, url: `/api/mockups/${row.id}/file`, mimeType: row.mimeType ?? "image/png", createdAt: row.createdAt };
  }

  const draft = await prisma.buildDraft.findUnique({
    where: { id: draftId },
    select: {
      printMockupFingerprint: true,
      printMockup: { select: { id: true, mimeType: true, createdAt: true } },
    },
  });

  if (!draft?.printMockup || draft.printMockupFingerprint !== fingerprint) return null;

  return {
    id: draft.printMockup.id,
    url: `/api/mockups/${draft.printMockup.id}/file`,
    mimeType: draft.printMockup.mimeType ?? "image/png",
    createdAt: draft.printMockup.createdAt,
  };
}

