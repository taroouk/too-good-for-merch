// file: app/studio/projects/[buildId]/builder/page.tsx
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import BuilderClient from "src/studio/ui/BuilderClient";

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;
  const userId = await getUserId();

  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: {
      id: true,
      name: true,
      draft: {
        select: {
          product: true,
          color: true,
          fabric: true,
          quantity: true,
          customNotes: true,
          primaryAssetId: true,
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

  return (
    <BuilderClient
      buildId={build.id}
      buildName={build.name ?? "Untitled"}
      draft={build.draft}
      placementsCount={placementsCount}
      initialUserAssets={initialUserAssets}
    />
  );
}
