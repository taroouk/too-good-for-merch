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
  // Lineage link to an earlier mockup row, when there is one.
  parentId?: string | null;
  // Which garment side this mockup shows. The draft's aiMockup* columns are
  // the FRONT (and every pre-layers single-artwork mockup); "back" writes the
  // backAiMockup* columns.
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
