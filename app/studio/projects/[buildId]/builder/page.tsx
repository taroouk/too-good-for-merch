// app/studio/projects/[buildId]/builder/page.tsx
import { prisma } from "src/lib/prisma";
import { requireUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import BuilderClient from "src/studio/ui/BuilderClient";

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;

  const userId = await requireUserId();
  await assertBuildAccess(userId, buildId);

  const build = await prisma.build.findFirst({
    where: { id: buildId, userId },
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

  if (!build || !build.draft) return <div className="text-sm text-gray-600">Not found.</div>;

  const placementsCount = build.designs.reduce((acc: any, d: { placements: string | any[]; }) => acc + d.placements.length, 0);

  return (
    <BuilderClient
      buildId={build.id}
      buildName={build.name ?? "Untitled"}
      draft={build.draft}
      placementsCount={placementsCount}
    />
  );
}