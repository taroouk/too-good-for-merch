// app/studio/projects/[buildId]/page.tsx
import Link from "next/link";
import { requireUserId } from "src/studio/authz";
import { getBuildWithDraft } from "src/db/builds";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;

  const userId = await requireUserId();
  const build = await getBuildWithDraft(userId, buildId);
  if (!build) return <div className="text-sm text-gray-600">Not found.</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">{build.name ?? "Untitled"}</div>
          <div className="text-xs text-gray-600">{build.status}</div>
        </div>

        <Link className="text-sm underline" href={`/studio/projects/${build.id}/builder`}>
          Open Builder
        </Link>
      </div>

      <div className="border rounded-lg p-3 text-sm">
        <div>Product: {build.draft?.product ?? "-"}</div>
        <div>Color: {build.draft?.color ?? "-"}</div>
        <div>Fabric: {build.draft?.fabric ?? "-"}</div>
        <div>Quantity: {build.draft?.quantity ?? 1}</div>
      </div>
    </div>
  );
}