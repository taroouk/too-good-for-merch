// app/studio/projects/page.tsx
import Link from "next/link";
import { requireUserId } from "src/studio/authz";
import { listBuildsByUser } from "src/db/builds";

export default async function StudioProjectsPage() {
  const userId = await requireUserId();
  const builds = await listBuildsByUser(userId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Link className="text-sm underline" href="/studio/projects/new">
          New Project
        </Link>
      </div>

      <div className="grid gap-3">
        {builds.map((b) => (
          <Link key={b.id} className="border rounded-lg p-3 hover:bg-gray-50" href={`/studio/projects/${b.id}/builder`}>
            <div className="flex items-center justify-between">
              <div className="font-medium">{b.name ?? "Untitled"}</div>
              <div className="text-xs text-gray-600">{b.status}</div>
            </div>
            <div className="text-xs text-gray-600">
              {b.draft?.product ?? "No product"} · {b.draft?.fabric ?? "No fabric"} · qty {b.draft?.quantity ?? 1}
            </div>
          </Link>
        ))}
        {builds.length === 0 && <div className="text-sm text-gray-600">No projects yet.</div>}
      </div>
    </div>
  );
}