import Link from "next/link";
import { prisma } from "src/lib/prisma";
import { requireUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import { actionCreateDesign, actionRemovePlacement, actionSetPlacementAsset } from "src/actions/design-actions";

const PLACEMENTS = [
  { key: "LEFT_CHEST", label: "Left Chest" },
  { key: "RIGHT_CHEST", label: "Right Chest" },
  { key: "LEFT_SLEEVE", label: "Left Sleeve" },
  { key: "RIGHT_SLEEVE", label: "Right Sleeve" },
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

  const designs = await prisma.design.findMany({
    where: { buildId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true },
  });

  const assets = await prisma.asset.findMany({
    where: { buildId },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, status: true },
    take: 50,
  });

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
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Designs</h1>
          <div className="text-xs text-gray-600">{build.name ?? "Project"}</div>
        </div>

        <Link className="text-sm underline" href={`/studio/projects/${buildId}/assets`}>
          Manage assets
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Left: designs list */}
        <aside className="border rounded-lg p-3 space-y-3">
          <div className="text-sm font-medium">Your Designs</div>

          <form action={boundCreateDesign} className="flex gap-2">
            <input
              name="name"
              className="flex-1 border rounded-md p-2 text-sm"
              placeholder="New design name"
              maxLength={120}
            />
            <button className="border rounded-md px-3 text-sm hover:bg-gray-50" type="submit">
              Create
            </button>
          </form>

          <div className="space-y-2">
            {designs.length === 0 && <div className="text-sm text-gray-600">No designs yet.</div>}
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
        </aside>

        {/* Right: placements grid */}
        <section className="space-y-3">
          <div className="border rounded-lg p-3">
            <div className="text-sm font-medium">Placements</div>
            <div className="text-xs text-gray-600">Choose an asset per placement (Phase 4 stub upload).</div>
          </div>

          {!activeDesignId ? (
            <div className="border rounded-lg p-4 text-sm text-gray-600">Create a design first.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {PLACEMENTS.map((p) => {
                const current = placementMap.get(p.key as any);
                const currentName = current?.asset?.fileName ?? null;

                return (
                  <div key={p.key} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{p.label}</div>
                      {current && (
                        <form action={boundRemovePlacement}>
                          <input type="hidden" name="designId" value={activeDesignId} />
                          <input type="hidden" name="placement" value={p.key} />
                          <button className="text-xs underline text-gray-600 hover:text-black" type="submit">
                            remove
                          </button>
                        </form>
                      )}
                    </div>

                    <div className="text-xs text-gray-600">
                      {currentName ? `Selected: ${currentName}` : "No asset selected"}
                    </div>

                    <form action={boundSetPlacementAsset} className="space-y-2">
                      <input type="hidden" name="designId" value={activeDesignId} />
                      <input type="hidden" name="placement" value={p.key} />

                      <select name="assetId" className="w-full border rounded-md p-2 text-sm" defaultValue={current?.assetId ?? ""}>
                        <option value="">Select asset…</option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.fileName} ({a.status})
                          </option>
                        ))}
                      </select>

                      <button className="w-full border rounded-md px-3 py-2 text-sm hover:bg-gray-50" type="submit" disabled={assets.length === 0}>
                        Set placement
                      </button>

                      {assets.length === 0 && (
                        <div className="text-xs text-gray-600">
                          No assets yet. Go to{" "}
                          <Link className="underline" href={`/studio/projects/${buildId}/assets`}>
                            Assets
                          </Link>{" "}
                          and add one.
                        </div>
                      )}
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