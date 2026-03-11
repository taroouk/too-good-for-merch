// file: app/studio/projects/[buildId]/page.tsx
import { prisma } from "src/lib/prisma";

export default async function ProjectOverviewPage({
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
      status: true,
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
      assets: { select: { id: true, status: true, fileName: true } },
      designs: { select: { id: true } },
    },
  });

  if (!build) return <div className="text-sm text-gray-600">Not found.</div>;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{build.name ?? "Untitled"}</h1>
      <div className="text-sm text-gray-600">Status: {build.status}</div>

      <div className="border rounded-md p-3 text-sm">
        <div className="font-medium mb-2">Draft</div>
        <div>Product: {build.draft?.product ?? "—"}</div>
        <div>Color: {build.draft?.color ?? "—"}</div>
        <div>Fabric: {build.draft?.fabric ?? "—"}</div>
        <div>Qty: {build.draft?.quantity ?? 1}</div>
      </div>

      <div className="text-sm text-gray-600">
        Assets: {build.assets.length} · Designs: {build.designs.length}
      </div>
    </div>
  );
}