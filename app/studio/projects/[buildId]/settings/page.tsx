// file: app/studio/projects/[buildId]/settings/page.tsx
import { prisma } from "src/lib/prisma";
import { actionRenameBuild } from "src/actions/build-actions";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;

  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: { id: true, name: true },
  });

  if (!build) return <div className="text-sm text-gray-600">Not found.</div>;

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>

      <form action={actionRenameBuild.bind(null, buildId)} className="space-y-3">
        <label className="block text-sm">
          Project name
          <input
            name="name"
            defaultValue={build.name ?? ""}
            className="mt-1 w-full border rounded-md p-2"
            placeholder="Untitled"
          />
        </label>

        <button
          type="submit"
          className="border rounded-md px-4 py-2 text-sm hover:bg-gray-50"
        >
          Save
        </button>
      </form>
    </div>
  );
}