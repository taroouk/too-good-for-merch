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

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<{ guest?: string }>;
}) {
  const userId = await getUserId();

  if (!userId) {
    const resolvedSearchParams = await searchParams;
    const showGuestMsg = resolvedSearchParams?.guest === "1";

    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Studio</h1>
          <Link className="shrink-0 text-sm underline" href="/">
            Home
          </Link>
        </div>

        {showGuestMsg ? (
          <div className="border rounded-lg p-4 text-sm text-gray-700">
            You’re browsing as a guest. Creating/saving projects will be available later.
            <br />
            Login will be required at checkout only.
          </div>
        ) : (
          <div className="border rounded-lg p-4 text-sm text-gray-700">
            You can enter the studio without logging in.
            <br />
            Login will be required at checkout only.
          </div>
        )}

        <div className="flex gap-3">
          <Link className="text-sm underline" href="/studio/projects/new">
            New Project
          </Link>
        </div>
      </main>
    );
  }

  const builds = (await listBuildsByUser(userId)) as BuildRow[];

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Link className="shrink-0 text-sm underline" href="/studio/projects/new">
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
    </main>
  );
}