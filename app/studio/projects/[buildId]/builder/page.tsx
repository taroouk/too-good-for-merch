// file: app/studio/projects/[buildId]/builder/page.tsx
import { prisma } from "src/lib/prisma";
import BuilderClient from "src/studio/ui/BuilderClient";

export default async function BuilderPage({
  params,
}: {
  params: { buildId: string };
}) {
  const { buildId } = params;

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
    />
  );
}