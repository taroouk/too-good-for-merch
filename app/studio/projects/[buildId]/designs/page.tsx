// app/studio/projects/[buildId]/designs/page.tsx
import { requireUserId } from "src/studio/authz";
import { getBuildWithDraft } from "src/db/builds";

export default async function DesignsPage({ params }: { params: { buildId: string } }) {
  const userId = await requireUserId();
  const build = await getBuildWithDraft(userId, params.buildId);
  if (!build) return <div className="text-sm text-gray-600">Not found.</div>;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Designs</h1>
      <div className="text-sm text-gray-600">Phase 4: placements UI comes next. DB is ready.</div>

      <div className="grid gap-2">
        {build.designs.map((d) => (
          <div key={d.id} className="border rounded-md p-3 text-sm">
            <div className="font-medium">{d.name ?? "Untitled design"}</div>
            <div className="text-xs text-gray-600">Updated: {new Date(d.updatedAt).toLocaleString()}</div>
          </div>
        ))}
        {build.designs.length === 0 && <div className="text-sm text-gray-600">No designs yet.</div>}
      </div>
    </div>
  );
}