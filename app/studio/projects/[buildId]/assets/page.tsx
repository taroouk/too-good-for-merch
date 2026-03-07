import { prisma } from "src/lib/prisma";
import { requireUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import { actionCreateAsset } from "src/actions/asset-actions";

export default async function AssetsPage({ params }: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await params;

  const userId = await requireUserId();
  await assertBuildAccess(userId, buildId);

  const assets = await prisma.asset.findMany({
    where: { buildId },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, status: true, createdAt: true },
    take: 50,
  });

  const boundCreate = actionCreateAsset.bind(null, buildId);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Assets</h1>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="text-sm font-medium">Add asset (Phase 4 stub)</div>
        <form action={boundCreate} className="grid gap-2 sm:grid-cols-3">
          <input name="fileName" className="border rounded-md p-2 text-sm sm:col-span-2" placeholder="file name (e.g. logo.png)" />
          <input name="mimeType" className="border rounded-md p-2 text-sm" placeholder="mime (e.g. image/png)" />
          <input name="sizeBytes" className="border rounded-md p-2 text-sm" placeholder="size bytes (e.g. 120345)" />
          <button className="border rounded-md px-3 py-2 text-sm hover:bg-gray-50 sm:col-span-3" type="submit">
            Add
          </button>
        </form>
        <div className="text-xs text-gray-600">Storage upload comes in Phase 5. This only creates DB records.</div>
      </div>

      <div className="grid gap-2">
        {assets.length === 0 && <div className="text-sm text-gray-600">No assets yet.</div>}
        {assets.map((a) => (
          <div key={a.id} className="border rounded-lg p-3">
            <div className="font-medium text-sm">{a.fileName}</div>
            <div className="text-xs text-gray-600">
              {a.status} · {a.mimeType ?? "unknown"} · {a.sizeBytes ?? 0} bytes ·{" "}
              {new Date(a.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}