// app/studio/projects/[buildId]/settings/page.tsx
import { requireUserId } from "src/studio/authz";
import { getBuildWithDraft } from "src/db/builds";
import { actionRenameBuild } from "src/actions/build-actions";

export default async function SettingsPage({ params }: { params: { buildId: string } }) {
  const userId = await requireUserId();
  const build = await getBuildWithDraft(userId, params.buildId);
  if (!build) return <div className="text-sm text-gray-600">Not found.</div>;

  const boundRename = actionRenameBuild.bind(null, build.id);

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>

      <form action={boundRename} className="space-y-3">
        <label className="block text-sm">
          Project name
          <input name="name" defaultValue={build.name ?? ""} className="mt-1 w-full border rounded-md p-2" maxLength={120} />
        </label>
        <button className="border rounded-md px-4 py-2 text-sm hover:bg-gray-50" type="submit">
          Save
        </button>
      </form>
    </div>
  );
}