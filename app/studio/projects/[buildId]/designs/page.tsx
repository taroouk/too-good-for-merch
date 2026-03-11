// file: app/studio/projects/[buildId]/designs/page.tsx
import { prisma } from "src/lib/prisma";

export default async function DesignsPage({
  params,
}: {
  params: { buildId: string };
}) {
  const { buildId } = params;

  const designs = await prisma.design.findMany({
    where: { buildId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      placements: { select: { id: true, placement: true, assetId: true } },
    },
  });

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Designs</h1>

      {designs.length === 0 ? (
        <div className="text-sm text-gray-600">No designs yet.</div>
      ) : (
        <div className="grid gap-3">
          {designs.map((d) => (
            <div key={d.id} className="border rounded-md p-3 text-sm">
              <div className="font-medium">{d.name ?? "Untitled"}</div>
              <div className="text-gray-600">
                Placements: {d.placements.length}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}