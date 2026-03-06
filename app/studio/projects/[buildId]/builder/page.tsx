// app/studio/projects/[buildId]/builder/page.tsx
import { requireUserId } from "src/studio/authz";
import { getBuildWithDraft } from "src/db/builds";
import BuilderClient from "src/studio/ui/BuilderClient";

export default async function BuilderPage({ params }: { params: { buildId: string } }) {
  const userId = await requireUserId();
  const build = await getBuildWithDraft(userId, params.buildId);
  if (!build || !build.draft) return <div className="text-sm text-gray-600">Not found.</div>;

  return <BuilderClient buildId={build.id} buildName={build.name ?? "Untitled"} draft={build.draft} />;
}