import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { PLACEMENTS, placementLabel, type PlacementKey } from "src/pricing/placements";

function isPlacementKey(value: string | null): value is PlacementKey {
  return value !== null && (PLACEMENTS as readonly string[]).includes(value);
}

function bytes(size: number | null) {
  if (!size) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date) {
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 120);
  const type = ["all", "artwork", "mockups"].includes(query.type ?? "") ? (query.type as string) : "all";

  const buildFilter: Prisma.BuildWhereInput | undefined = q
    ? {
        OR: [
          { id: { contains: q, mode: "insensitive" } },
          { orders: { some: { OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
            { customerEmail: { contains: q, mode: "insensitive" } },
          ] } } },
        ],
      }
    : undefined;

  const [assets, mockups, assetTotal, mockupTotal] = await Promise.all([
    type === "mockups"
      ? Promise.resolve([])
      : prisma.asset.findMany({
          where: q ? { OR: [{ fileName: { contains: q, mode: "insensitive" } }, { build: buildFilter }] } : undefined,
          orderBy: { uploadedAt: "desc" },
          take: 100,
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            uploadedAt: true,
            status: true,
            build: { select: { id: true, orders: { select: { id: true, orderNumber: true }, orderBy: { createdAt: "desc" }, take: 1 } } },
          },
        }),
    type === "artwork"
      ? Promise.resolve([])
      : prisma.mockup.findMany({
          where: q ? { build: buildFilter } : undefined,
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            kind: true,
            placement: true,
            mimeType: true,
            createdAt: true,
            build: { select: { id: true, orders: { select: { id: true, orderNumber: true }, orderBy: { createdAt: "desc" }, take: 1 } } },
          },
        }),
    prisma.asset.count(),
    prisma.mockup.count(),
  ]);

  const tabs = [
    ["all", "All files"],
    ["artwork", "Artwork"],
    ["mockups", "Mockups"],
  ] as const;

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Storage</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Files</h1>
            <p className="mt-2 text-sm text-black/45">Customer artwork and generated mockups. All previews are served through authenticated, admin-only routes.</p>
          </div>
        </div>

        <section className="mt-7 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#111827] p-5 text-white">
            <p className="text-sm text-white/50">Artwork files</p>
            <p className="mt-2 text-3xl font-semibold">{assetTotal}</p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <p className="text-sm text-black/45">Generated mockups</p>
            <p className="mt-2 text-3xl font-semibold">{mockupTotal}</p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 p-4 sm:p-5">
            <form className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex max-w-xl flex-1 gap-2">
                <input name="q" defaultValue={q} placeholder="Search build ID, order number, customer…" className="h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-[#f8f8f8] px-4 text-sm outline-none focus:border-black" />
                <input type="hidden" name="type" value={type} />
                <button className="h-11 rounded-xl bg-[#111827] px-5 text-sm font-semibold text-white">Search</button>
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {tabs.map(([value, label]) => (
                  <Link key={value} href={`/admin/files?type=${value}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${type === value ? "bg-[#111827] text-white" : "bg-black/5 text-black/50"}`}>
                    {label}
                  </Link>
                ))}
              </div>
            </form>
          </div>

          {type !== "mockups" ? (
            <div>
              <div className="border-b border-black/5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-black/40">Artwork ({assets.length})</div>
              {assets.length ? (
                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {assets.map((asset) => {
                    const order = asset.build?.orders[0];
                    return (
                      <div key={asset.id} className="overflow-hidden rounded-xl border border-black/10">
                        <a href={`/api/assets/${asset.id}/file`} target="_blank" rel="noreferrer" className="flex h-40 items-center justify-center bg-[#faf8f6]">
                          <img src={`/api/assets/${asset.id}/file`} alt={asset.fileName} className="h-full w-full object-contain" />
                        </a>
                        <div className="p-3 text-xs">
                          <p className="truncate font-semibold text-black/80">{asset.fileName}</p>
                          <p className="mt-1 text-black/40">{asset.mimeType ?? "unknown"} · {bytes(asset.sizeBytes)}</p>
                          <p className="mt-1 text-black/40">{formatDate(asset.uploadedAt)}</p>
                          {order ? (
                            <Link href={`/admin/orders/${order.id}`} className="mt-2 inline-block font-semibold text-[#a56a2a] hover:underline">
                              Order {order.orderNumber} →
                            </Link>
                          ) : (
                            <p className="mt-2 text-black/35">Build {asset.build?.id.slice(0, 10)}… (no order yet)</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center text-sm text-black/40">No artwork files match.</div>
              )}
            </div>
          ) : null}

          {type !== "artwork" ? (
            <div>
              <div className="border-b border-black/5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-black/40">Mockups ({mockups.length})</div>
              {mockups.length ? (
                <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {mockups.map((mockup) => {
                    const order = mockup.build?.orders[0];
                    const placement = isPlacementKey(mockup.placement) ? placementLabel(mockup.placement) : (mockup.placement ?? "—");
                    return (
                      <div key={mockup.id} className="overflow-hidden rounded-xl border border-black/10">
                        <a href={`/api/mockups/${mockup.id}/file`} target="_blank" rel="noreferrer" className="flex h-40 items-center justify-center bg-[#faf8f6]">
                          <img src={`/api/mockups/${mockup.id}/file`} alt={`${mockup.kind} mockup`} className="h-full w-full object-contain" />
                        </a>
                        <div className="p-3 text-xs">
                          <p className="font-semibold text-black/80">{mockup.kind === "PRINT" ? "Print mockup" : "AI mockup"}</p>
                          <p className="mt-1 text-black/40">{placement} · {formatDate(mockup.createdAt)}</p>
                          {order ? (
                            <Link href={`/admin/orders/${order.id}`} className="mt-2 inline-block font-semibold text-[#a56a2a] hover:underline">
                              Order {order.orderNumber} →
                            </Link>
                          ) : (
                            <p className="mt-2 text-black/35">Build {mockup.build?.id.slice(0, 10)}… (no order yet)</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center text-sm text-black/40">No mockups match.</div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
