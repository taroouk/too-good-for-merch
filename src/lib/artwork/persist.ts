// Server-only DB helper that turns the current draft's AI mockup into a
// persistent, owner-scoped Artwork row (upsert on sourceMockupId -- never a
// duplicate). Shared by the explicit "Save T-Shirt" action
// (src/actions/artwork-actions.ts) and the implicit auto-save done when a
// build without a saved artwork is added to the wishlist or submitted as a
// bespoke request. Not a "use server" module -- it is imported by those.
import { prisma } from "src/lib/prisma";
import { compressMockupImage } from "src/lib/image/compress-mockup";
import {
  resolveArtworkUpsert,
  artworkFileUrl,
  normalizeArtworkPlacement,
} from "src/lib/artwork/save";

export type PersistArtworkResult = {
  artworkId: string;
  url: string;
  sha256: string;
};

const DRAFT_SELECT = {
  id: true,
  aiMockupId: true,
  printMockupId: true,
  savedArtworkId: true,
  artworkPlacement: true,
  aiMockup: {
    select: { id: true, mimeType: true, data: true, model: true, prompt: true },
  },
  // The Print Mockup is the real print (the customer's artwork at the chosen placement on the model photo). It is
  // saved when there is no photoreal AI mockup (Gemini unavailable), so a design can always be saved.
  printMockup: {
    select: { id: true, mimeType: true, data: true, model: true, prompt: true },
  },
} as const;

// Persists the draft's AI mockup as an Artwork and points
// BuildDraft.savedArtworkId at it. `placement`, when provided, is also
// written to BuildDraft.artworkPlacement. Returns null when there is no AI
// mockup to save (caller decides whether that is an error).
export async function saveArtworkForBuild(
  buildId: string,
  opts: { ownerUserId: string | null; placement?: unknown } = { ownerUserId: null },
): Promise<PersistArtworkResult | null> {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: { id: true, userId: true, draft: { select: DRAFT_SELECT } },
  });
  if (!build?.draft) return null;
  const source = build.draft.aiMockup ?? build.draft.printMockup;
  if (!source) return null;

  // The saved copy is stored compressed (older mockups are still big PNGs).
  const compressed = source.data
    ? await compressMockupImage(Buffer.from(source.data), source.mimeType || "image/png")
    : null;

  const args = resolveArtworkUpsert({
    userId: build.userId ?? opts.ownerUserId ?? null,
    buildId: build.id,
    mockup: {
      id: source.id,
      mimeType: compressed?.mimeType ?? source.mimeType,
      data: compressed?.data ?? source.data,
      model: source.model,
      prompt: source.prompt,
    },
  });

  const artwork = await prisma.artwork.upsert({
    where: args.where,
    create: args.create,
    update: args.update,
    select: { id: true, sha256: true },
  });

  const placement =
    opts.placement !== undefined
      ? normalizeArtworkPlacement(opts.placement)
      : undefined;

  await prisma.buildDraft.update({
    where: { id: build.draft.id },
    data: {
      savedArtworkId: artwork.id,
      ...(placement !== undefined && placement !== null ? { artworkPlacement: placement } : {}),
    },
  });

  return { artworkId: artwork.id, url: artworkFileUrl(artwork.id), sha256: artwork.sha256 };
}

// Returns the id of the artwork to attach to a wishlist item / bespoke
// request for this build: the already-saved one, or a freshly auto-saved
// one, or null if the build has no generated artwork at all.
export async function resolveArtworkIdForBuild(
  buildId: string,
  ownerUserId: string | null,
  placement?: unknown,
): Promise<string | null> {
  const draft = await prisma.buildDraft.findUnique({
    where: { buildId },
    select: { savedArtworkId: true, aiMockupId: true, printMockupId: true },
  });
  if (!draft) return null;
  if (draft.savedArtworkId) return draft.savedArtworkId;
  if (!draft.aiMockupId && !draft.printMockupId) return null;
  const saved = await saveArtworkForBuild(buildId, { ownerUserId, placement });
  return saved?.artworkId ?? null;
}
