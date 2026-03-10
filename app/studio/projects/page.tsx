// file: app/studio/projects/page.tsx
import Link from "next/link";
import { getUserId } from "src/studio/authz";
import { listBuildsByUser } from "src/db/builds";

type BuildRow = {
  id: string;
  name: string | null;
  draft?: {
    product: string | null;
    fabric: string | null;
    quantity: number | null;
  } | null;
};

export default async function ProjectsPage() {
  const userId = await getUserId();

  if (!userId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Studio</h1>
          <Link className="text-sm underline" href="/login?callbackUrl=/studio/projects">
            Login
          </Link>
        </div>

        <div className="border rounded-lg p-4 text-sm text-gray-600">
          You can view the studio without logging in.
          <br />
          Login is required only when you checkout (or create/save a project).
        </div>

        <div className="flex gap-3">
          <Link className="text-sm underline" href="/studio/projects/new">
            Create a Project
          </Link>
          <Link className="text-sm underline" href="/">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const builds = (await listBuildsByUser(userId)) as BuildRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Link className="text-sm underline" href="/studio/projects/new">
          New Project
        </Link>
      </div>

      {builds.length === 0 ? (
        <div className="border rounded-lg p-4 text-sm text-gray-600">
          No projects yet. Click <span className="font-medium">New Project</span> to create one.
        </div>
      ) : (
        <div className="grid gap-3">
          {builds.map((b) => (
            <Link
              key={b.id}
              className="block border rounded-lg p-3 hover:bg-gray-50"
              href={`/studio/projects/${b.id}`}
            >
              <div className="font-medium">{b.name ?? "Untitled"}</div>
              <div className="text-sm text-gray-600">
                {(b.draft?.product ?? "No product")} · {(b.draft?.fabric ?? "No fabric")} · qty{" "}
                {b.draft?.quantity ?? 1}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}