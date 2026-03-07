// app/studio/projects/[buildId]/designs/page.tsx
import Link from "next/link";
import { prisma } from "src/lib/prisma";
import { requireUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import {
  actionCreateDesign,
  actionSetPlacementAsset,
  actionRemovePlacement,
} from "src/actions/design-actions";

const PLACEMENTS = [
  { key: "LEFT_CHEST", label: "Left Chest" },
  { key: "RIGHT_CHEST", label: "Right Chest" },
  { key: "RIGHT_SLEEVE", label: "Right Sleeve" },
  { key: "LEFT_SLEEVE", label: "Left Sleeve" },
  { key: "CENTER_FRONT", label: "Center Front" },
  { key: "FULL_FRONT", label: "Full Front" },
  { key: "CENTER_BACK", label: "Center Back" },
  { key: "FULL_BACK", label: "Full Back" },
] as const;

export default async function DesignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildId: string }>;
  searchParams: Promise<{ design?: string }>;
}) {
  const { buildId } = await params;
  const sp = await searchParams;

  const userId = await requireUserId();
  await assertBuildAccess(userId, buildId);

  const build = await prisma.build.findFirst({
    where: { id: buildId, userId },
    select: { id: true, name: true },
  });

  if (!build) return <div className="text-sm text-gray-600">Not found.</div>;

  const [assets, designs] = await Promise.all([
    prisma.asset.findMany({
      where: { buildId },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, status: true },
      take: 100,
    }),
    prisma.design.findMany({
      where: { buildId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, updatedAt: true },
    }),
  ]);

  const activeDesignId = sp.design ?? designs[0]?.id ?? null;

  const placements = activeDesignId
    ? await prisma.designPlacement.findMany({
        where: { designId: activeDesignId },
        select: { placement: true, assetId: true, asset: { select: { fileName: true } } },
      })
    : [];

  const placementMap = new Map(placements.map((p) => [p.placement, p]));

  const boundCreateDesign = actionCreateDesign.bind(null, buildId);
  const boundSetPlacementAsset = actionSetPlacementAsset.bind(null, buildId);
  const boundRemovePlacement = actionRemovePlacement.bind(null, buildId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Designs</h1>
          <div className="text-sm text-gray-600">Assign an asset per placement (Phase 4).</div>
          <div className="text-xs text-gray-500 mt-1">
            Project: <span className="font-medium text-gray-700">{build.name ?? "Untitled"}</span>
          </div>
        </div>

        <Link className="text-sm underline hover:no-underline" href={`/studio/projects/${buildId}/assets`}>
          Manage assets
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Left */}
        <section className="border rounded-xl p-4 bg-white space-y-4">
          <div className="font-medium">Your Designs</div>

          <form action={boundCreateDesign} className="flex gap-2">
            <input
              className="flex-1 border rounded-md p-2 text-sm"
              name="name"
              placeholder="New design name"
              required
              maxLength={120}
            />
            <button className="border rounded-md px-3 text-sm hover:bg-gray-50" type="submit">
              Create
            </button>
          </form>

          {designs.length === 0 ? (
            <div className="text-sm text-gray-600">No designs yet.</div>
          ) : (
            <div className="space-y-2">
              {designs.map((d) => (
                <Link
                  key={d.id}
                  href={`/studio/projects/${buildId}/designs?design=${d.id}`}
                  className={`block border rounded-md p-2 text-sm hover:bg-gray-50 ${
                    d.id === activeDesignId ? "bg-gray-50" : ""
                  }`}
                >
                  <div className="font-medium">{d.name ?? "Untitled"}</div>
                  <div className="text-xs text-gray-600">{new Date(d.updatedAt).toLocaleString()}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Right */}
        <section className="border rounded-xl p-4 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Placements</div>
              <div className="text-xs text-gray-600">Choose an asset per placement.</div>
            </div>
          </div>

          {!activeDesignId ? (
            <div className="text-sm text-gray-600 border rounded-lg p-4">Create a design first.</div>
          ) : assets.length === 0 ? (
            <div className="text-sm text-gray-600 border rounded-lg p-4">
              Add at least 1 asset first from{" "}
              <Link className="underline" href={`/studio/projects/${buildId}/assets`}>
                Assets
              </Link>
              .
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {PLACEMENTS.map((p) => {
                const current = placementMap.get(p.key as any);
                const currentName = current?.asset?.fileName ?? "None";

                return (
                  <div key={p.key} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{p.label}</div>
                      {current?.assetId ? (
                        <form action={boundRemovePlacement}>
                          <input type="hidden" name="designId" value={activeDesignId} />
                          <input type="hidden" name="placement" value={p.key} />
                          <button className="text-xs underline text-gray-600 hover:text-black" type="submit">
                            remove
                          </button>
                        </form>
                      ) : null}
                    </div>

                    <div className="text-xs text-gray-600">Current: {currentName}</div>

                    <form action={boundSetPlacementAsset} className="flex gap-2">
                      <input type="hidden" name="designId" value={activeDesignId} />
                      <input type="hidden" name="placement" value={p.key} />
                      <select
                        className="flex-1 border rounded-md p-2 text-sm"
                        name="assetId"
                        defaultValue={current?.assetId ?? ""}
                      >
                        <option value="">— None —</option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.fileName} ({a.status})
                          </option>
                        ))}
                      </select>
                      <button className="border rounded-md px-3 text-sm hover:bg-gray-50" type="submit">
                        Save
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}