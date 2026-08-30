// file: app/studio/projects/[buildId]/builder/page.tsx
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import BuilderClient from "src/studio/ui/BuilderClient";

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: {
      id: true,
      name: true,
      draft: {
        select: {
          id: true,
          product: true,
          color: true,
          fabric: true,
          quantity: true,
          customNotes: true,
          primaryAssetId: true,
          customQuoteUsdCents: true,
          customQuoteNote: true,
          savedArtworkId: true,
          artworkPlacement: true,
          printMockupId: true,
          printMockupFingerprint: true,
          printMockup: { select: { id: true, mimeType: true } },
          aiMockupId: true,
          aiMockupFingerprint: true,
          aiMockup: { select: { id: true, mimeType: true } },
        },
      },
      designs: {
        select: {
          placements: { select: { id: true } },
        },
      },
    },
  });

  if (!build || !build.draft) {
    return <div className="text-sm text-gray-600">Not found.</div>;
  }

  const initialUserAssetsRaw = await prisma.asset.findMany({
    where: {
      url: { not: null },
      OR: userId ? [{ buildId }, { build: { userId } }] : [{ buildId }],
    },
    orderBy: { createdAt: "desc" },
    take: 24,
    select: {
      id: true,
      buildId: true,
      url: true,
      fileName: true,
    },
  });

  const initialUserAssets = initialUserAssetsRaw
    .filter((asset): asset is typeof asset & { url: string } => Boolean(asset.url))
    .map((asset) => ({
      id: asset.id,
      buildId: asset.buildId,
      url: asset.url,
      fileName: asset.fileName,
    }));

  const placementsCount = build.designs.reduce(
    (acc, d) => acc + d.placements.length,
    0
  );

  const initialMockupUrl =
    build.draft.printMockupId && build.draft.printMockup
      ? `/api/mockups/${build.draft.printMockup.id}/file`
      : null;
  const initialMockupFingerprint = build.draft.printMockupFingerprint ?? null;
  const initialAiMockupUrl =
    build.draft.aiMockupId && build.draft.aiMockup
      ? `/api/mockups/${build.draft.aiMockup.id}/file`
      : null;
  const initialAiMockupFingerprint = build.draft.aiMockupFingerprint ?? null;

  const initialSavedArtworkUrl = build.draft.savedArtworkId
    ? `/api/artworks/${build.draft.savedArtworkId}/file`
    : null;
  const initialArtworkPlacement =
    build.draft.artworkPlacement && typeof build.draft.artworkPlacement === "object"
      ? (build.draft.artworkPlacement as {
          placement?: string | null;
          x?: number;
          y?: number;
          scale?: number;
          rotation?: number;
        })
      : null;

  const initialInWishlist = userId
    ? Boolean(
        await prisma.wishlistItem.findUnique({
          where: { userId_buildId: { userId, buildId } },
          select: { id: true },
        }),
      )
    : false;

  return (
    <BuilderClient
      buildId={build.id}
      draftId={build.draft.id}
      buildName={build.name ?? "Untitled"}
      draft={build.draft}
      placementsCount={placementsCount}
      initialUserAssets={initialUserAssets}
      initialMockupUrl={initialMockupUrl}
      initialMockupFingerprint={initialMockupFingerprint}
      initialAiMockupUrl={initialAiMockupUrl ?? null}
      initialAiMockupFingerprint={initialAiMockupFingerprint}
      initialCustomQuoteUsdCents={build.draft.customQuoteUsdCents ?? null}
      initialCustomQuoteNote={build.draft.customQuoteNote ?? null}
      initialSavedArtworkUrl={initialSavedArtworkUrl}
      initialArtworkPlacement={initialArtworkPlacement}
      initialInWishlist={initialInWishlist}
    />
  );
}
