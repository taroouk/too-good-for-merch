// app/studio/projects/[buildId]/assets/page.tsx
import Link from "next/link";
import { prisma } from "src/lib/prisma";
import { requireUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import { actionCreateAsset } from "src/actions/asset-actions";

export default async function AssetsPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;

  const userId = await requireUserId();
  await assertBuildAccess(userId, buildId);

  const build = await prisma.build.findFirst({
    where: { id: buildId, userId },
    select: { id: true, name: true },
  });

  if (!build) return <div className="text-sm text-gray-600">Not found.</div>;

  const assets = await prisma.asset.findMany({
    where: { buildId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      createdAt: true,
    },
    take: 50,
  });

  const boundCreate = actionCreateAsset.bind(null, buildId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Assets</h1>
          <div className="text-sm text-gray-600">
            Phase 4: DB records only. Real upload in Phase 5.
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Project: <span className="font-medium text-gray-700">{build.name ?? "Untitled"}</span>
          </div>
        </div>

        <Link className="text-sm underline hover:no-underline" href={`/studio/projects/${buildId}/designs`}>
          Go to Designs
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[520px_1fr]">
        <section className="border rounded-xl p-4 bg-white space-y-3">
          <div className="font-medium">Add asset (stub)</div>

          <form action={boundCreate} className="space-y-3">
            <label className="block text-sm">
              File name
              <input
                name="fileName"
                className="mt-1 w-full border rounded-md p-2 text-sm"
                placeholder="e.g. logo.png"
                required
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                MIME type
                <input
                  name="mimeType"
                  className="mt-1 w-full border rounded-md p-2 text-sm"
                  placeholder="e.g. image/png"
                />
              </label>

              <label className="block text-sm">
                Size (bytes)
                <input
                  name="sizeBytes"
                  className="mt-1 w-full border rounded-md p-2 text-sm"
                  placeholder="e.g. 120345"
                  inputMode="numeric"
                />
              </label>
            </div>

            <button className="w-full border rounded-md px-4 py-2 text-sm hover:bg-gray-50" type="submit">
              Add
            </button>

            <div className="text-xs text-gray-500">
              Storage upload comes in Phase 5. This only creates DB records.
            </div>
          </form>
        </section>

        <section className="border rounded-xl p-4 bg-white">
          <div className="flex items-center justify-between">
            <div className="font-medium">Your assets</div>
            <div className="text-xs text-gray-500">{assets.length} total</div>
          </div>

          <div className="mt-4">
            {assets.length === 0 ? (
              <div className="text-sm text-gray-600">No assets yet.</div>
            ) : (
              <div className="divide-y">
                {assets.map((a) => (
                  <div key={a.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{a.fileName}</div>
                      <div className="text-xs text-gray-600">
                        {a.status} · {a.mimeType ?? "unknown"} · {(a.sizeBytes ?? 0).toLocaleString()} bytes
                      </div>
                      <div className="text-[11px] text-gray-500">{new Date(a.createdAt).toLocaleString()}</div>
                    </div>

                    <div className="text-[11px] text-gray-500">{a.id.slice(0, 8)}…</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}