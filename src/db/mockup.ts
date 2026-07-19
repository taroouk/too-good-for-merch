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
};

export type MockupRecord = {
  id: string;
  url: string;
  mimeType: string;
  createdAt: Date;
};

export function computeMockupFingerprint(input: {
  assetId: string | null;
  placement: string;
  x: number;
  y: number;
  scale: number;
  product: string | null;
  color: string | null;
}): string {
  const raw = [
    input.assetId ?? "none",
    input.placement,
    Math.round(input.x),
    Math.round(input.y),
    Math.round(input.scale * 1000) / 1000,
    input.product ?? "none",
    input.color ?? "none",
  ].join("|");

  return createHash("sha256").update(raw).digest("hex");
}

export async function upsertMockupForDraft(
  draftId: string,
  input: MockupInput,
): Promise<MockupRecord> {
  const id = randomUUID();

  const created = await prisma.mockup.create({
    data: {
      id,
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
    data: {
      mockupId: created.id,
      mockupFingerprint: input.fingerprint,
      mockupGeneratedAt: created.createdAt,
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
      mockupId: null,
      mockupFingerprint: null,
      mockupGeneratedAt: null,
    },
    select: { id: true },
  });
}

export async function getDraftMockupUrl(draftId: string): Promise<string | null> {
  const draft = await prisma.buildDraft.findUnique({
    where: { id: draftId },
    select: {
      mockupId: true,
      mockupFingerprint: true,
      mockup: { select: { id: true, mimeType: true } },
    },
  });

  if (!draft?.mockupId || !draft.mockup) return null;
  return `/api/mockups/${draft.mockup.id}/file`;
}
