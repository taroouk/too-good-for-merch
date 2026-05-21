// file: app/studio/projects/[buildId]/assets/page.tsx
import { prisma } from "src/lib/prisma";

export default async function AssetsPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;

  const assets = await prisma.asset.findMany({
    where: { buildId },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, status: true, createdAt: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Assets</h1>
      {assets.length === 0 ? (
        <div className="text-sm text-gray-600">No assets yet.</div>
      ) : (
        <div className="grid gap-2">
          {assets.map((a) => (
            <div key={a.id} className="border rounded-md p-3 text-sm">
              <div className="font-medium">{a.fileName}</div>
              <div className="text-gray-600">{a.status}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}