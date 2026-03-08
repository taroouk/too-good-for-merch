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

type PlacementKey = (typeof PLACEMENTS)[number]["key"];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

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
      take: 200,
    }),
    prisma.design.findMany({
      where: { buildId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, updatedAt: true },
    }),
  ]);

  type AssetRow = (typeof assets)[number];
  type DesignRow = (typeof designs)[number];

  const activeDesignId: string | null = sp.design ?? designs[0]?.id ?? null;

  const placements = activeDesignId
    ? await prisma.designPlacement.findMany({
        where: { designId: activeDesignId },
        select: {
          placement: true,
          assetId: true,
          asset: { select: { fileName: true } },
        },
      })
    : [];

  type PlacementRow = (typeof placements)[number];

  const placementMap: Map<PlacementKey, PlacementRow> = new Map(
    placements.map((p: PlacementRow) => [p.placement as PlacementKey, p])
  );

  const boundCreateDesign = actionCreateDesign.bind(null, buildId);
  const boundSetPlacementAsset = actionSetPlacementAsset.bind(null, buildId);
  const boundRemovePlacement = actionRemovePlacement.bind(null, buildId);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Designs</h1>
          <div className="text-sm text-gray-600">
            Assign an asset per placement (Phase 4).
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Project:{" "}
            <span className="font-medium text-gray-700">
              {build.name ?? "Untitled"}
            </span>
          </div>
        </div>

        <Link
          className="inline-flex items-center justify-center border rounded-md px-3 py-2 text-sm hover:bg-gray-50 w-full sm:w-auto"
          href={`/studio/projects/${buildId}/assets`}
        >
          Manage assets
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* Left */}
        <section className="border rounded-xl bg-white p-4 space-y-4">
          <div className="font-medium">Your Designs</div>

          <form action={boundCreateDesign} className="space-y-2">
            <input
              className="w-full border rounded-md p-2 text-sm"
              name="name"
              placeholder="New design name"
              required
              maxLength={120}
            />
            <button
              className="w-full border rounded-md px-3 py-2 text-sm hover:bg-gray-50"
              type="submit"
            >
              Create
            </button>
          </form>

          {designs.length === 0 ? (
            <div className="text-sm text-gray-600">No designs yet.</div>
          ) : (
            <div className="space-y-2">
              {designs.map((d: DesignRow) => {
                const active = d.id === activeDesignId;
                return (
                  <Link
                    key={d.id}
                    href={`/studio/projects/${buildId}/designs?design=${d.id}`}
                    className={cn(
                      "block border rounded-lg p-3 text-sm hover:bg-gray-50 transition",
                      active && "border-black"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {d.name ?? "Untitled"}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {new Date(d.updatedAt).toLocaleString()}
                        </div>
                      </div>

                      {active ? (
                        <span className="text-[11px] border border-black rounded-full px-2 py-1 shrink-0">
                          Active
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Right */}
        <section className="border rounded-xl bg-white p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">Placements</div>
              <div className="text-xs text-gray-600">
                Choose an asset per placement.
              </div>
            </div>

            <div className="text-xs text-gray-500">
              {activeDesignId ? "Editing" : "No design"}
            </div>
          </div>

          {!activeDesignId ? (
            <div className="text-sm text-gray-600 border rounded-lg p-4">
              Create a design first.
            </div>
          ) : assets.length === 0 ? (
            <div className="text-sm text-gray-600 border rounded-lg p-4">
              Add at least 1 asset first from{" "}
              <Link className="underline" href={`/studio/projects/${buildId}/assets`}>
                Assets
              </Link>
              .
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {PLACEMENTS.map((p) => {
                const current = placementMap.get(p.key);
                const currentName = current?.asset?.fileName ?? "None";

                return (
                  <div key={p.key} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{p.label}</div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          Current:{" "}
                          <span className="font-medium">{currentName}</span>
                        </div>
                      </div>

                      {current?.assetId ? (
                        <form action={boundRemovePlacement}>
                          <input type="hidden" name="designId" value={activeDesignId} />
                          <input type="hidden" name="placement" value={p.key} />
                          <button
                            className="text-xs underline text-gray-600 hover:text-black"
                            type="submit"
                          >
                            remove
                          </button>
                        </form>
                      ) : null}
                    </div>

                    <form action={boundSetPlacementAsset} className="space-y-2">
                      <input type="hidden" name="designId" value={activeDesignId} />
                      <input type="hidden" name="placement" value={p.key} />

                      <select
                        className="w-full border rounded-md p-2 text-sm"
                        name="assetId"
                        defaultValue={current?.assetId ?? ""}
                      >
                        <option value="">— None —</option>
                        {assets.map((a: AssetRow) => (
                          <option key={a.id} value={a.id}>
                            {a.fileName} ({a.status})
                          </option>
                        ))}
                      </select>

                      <button
                        className="w-full border rounded-md px-3 py-2 text-sm hover:bg-gray-50"
                        type="submit"
                      >
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