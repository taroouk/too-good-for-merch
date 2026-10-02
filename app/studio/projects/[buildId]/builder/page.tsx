// file: app/studio/projects/[buildId]/builder/page.tsx
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import BuilderClient from "src/studio/ui/BuilderClient";
import { draftArtworkLayers } from "src/studio/artwork-layers";

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
          artworkLayers: true,
          backPrintMockupId: true,
          backPrintMockupFingerprint: true,
          backAiMockupId: true,
          backAiMockupFingerprint: true,
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
      // Removed via the × in "Your uploads" (see actionRemoveAsset).
      hiddenAt: null,
      OR: userId ? [{ buildId }, { build: { userId } }] : [{ buildId }],
    },
    orderBy: { createdAt: "desc" },
    take: 48,
    select: {
      id: true,
      buildId: true,
      url: true,
      fileName: true,
      artworkSha256: true,
    },
  });

  // One tile per image: picking an upload from another project copies it
  // into this one (actionAttachExistingAsset), so the same image can exist
  // as several rows -- dedupe by content hash, preferring this project's
  // copy, and put the artwork currently on the shirt first.
  const primaryAssetId = build.draft.primaryAssetId;
  const byImage = new Map<string, { id: string; buildId: string; url: string; fileName: string; hash: string | null }>();
  for (const asset of initialUserAssetsRaw) {
    if (!asset.url) continue;
    const key = asset.artworkSha256 ?? asset.id;
    const dto = { id: asset.id, buildId: asset.buildId, url: asset.url, fileName: asset.fileName, hash: asset.artworkSha256 };
    const existing = byImage.get(key);
    const better =
      !existing ||
      asset.id === primaryAssetId ||
      (existing.id !== primaryAssetId && existing.buildId !== buildId && asset.buildId === buildId);
    if (better) byImage.set(key, dto);
  }
  const deduped = [...byImage.values()];
  const primaryIndex = deduped.findIndex((asset) => asset.id === primaryAssetId);
  if (primaryIndex > 0) deduped.unshift(...deduped.splice(primaryIndex, 1));
  const initialUserAssets = deduped.slice(0, 24);

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

  // Multi-artwork design (or the single legacy artwork as one layer), with
  // each layer's image URL -- looked up directly rather than from the
  // "Your uploads" list, which is capped and deduped.
  const draftLayers = draftArtworkLayers(build.draft);
  const layerAssets = draftLayers.length
    ? await prisma.asset.findMany({
        where: { id: { in: draftLayers.map((layer) => layer.assetId) }, buildId },
        select: { id: true, url: true, fileName: true, artworkSha256: true },
      })
    : [];
  const layerAssetById = new Map(layerAssets.map((asset) => [asset.id, asset]));
  const initialLayers = draftLayers.flatMap((layer) => {
    const asset = layerAssetById.get(layer.assetId);
    return asset?.url
      ? [{ ...layer, url: asset.url, fileName: asset.fileName, hash: asset.artworkSha256 }]
      : [];
  });
  const mockupFileUrl = (id: string | null) => (id ? `/api/mockups/${id}/file` : null);

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
      initialLayers={initialLayers}
      initialBackMockupUrl={mockupFileUrl(build.draft.backPrintMockupId)}
      initialBackMockupFingerprint={build.draft.backPrintMockupFingerprint ?? null}
      initialBackAiMockupUrl={mockupFileUrl(build.draft.backAiMockupId)}
      initialBackAiMockupFingerprint={build.draft.backAiMockupFingerprint ?? null}
    />
  );
}
