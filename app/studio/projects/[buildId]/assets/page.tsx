// app/studio/projects/[buildId]/assets/page.tsx
import { requireUserId } from "src/studio/authz";
import { getBuildWithDraft } from "src/db/builds";

export default async function AssetsPage({ params }: { params: { buildId: string } }) {
  const userId = await requireUserId();
  const build = await getBuildWithDraft(userId, params.buildId);
  if (!build) return <div className="text-sm text-gray-600">Not found.</div>;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Assets</h1>
      <div className="text-sm text-gray-600">Phase 4: assets are DB records only (storage in Phase 5).</div>

      <div className="grid gap-2">
        {build.assets.map((a) => (
          <div key={a.id} className="border rounded-md p-3 text-sm">
            <div className="font-medium">{a.fileName}</div>
            <div className="text-xs text-gray-600">
              {a.status} · {a.mimeType ?? "unknown"} · {a.sizeBytes ?? 0} bytes
            </div>
          </div>
        ))}
        {build.assets.length === 0 && <div className="text-sm text-gray-600">No assets yet.</div>}
      </div>
    </div>
  );
}