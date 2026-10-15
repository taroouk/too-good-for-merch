import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { compressArtworksAction, deleteArtworkAction } from "src/actions/admin-artwork-actions";
import AdminToast from "src/components/admin/AdminToast";
import { prisma } from "src/lib/prisma";
import { draftArtworkLayers } from "src/studio/artwork-layers";
import { placementLabel } from "src/pricing/placements";
import PageHeader from "src/components/admin/ui/PageHeader";
import StatCard from "src/components/admin/ui/StatCard";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import SearchField from "src/components/admin/ui/SearchField";
import EmptyState from "src/components/admin/ui/EmptyState";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import Pagination, { getPageCount, pageHref } from "src/components/admin/ui/Pagination";
import { buttonClass } from "src/components/admin/ui/Button";

const PAGE_SIZE = 24;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function AdminArtworksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; notice?: string; show?: string }>;
}) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 120);
  // Default: every saved artwork (as before). "paid" narrows to customers who checked out and paid.
  const show = query.show === "paid" ? "paid" : "all";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  // Only artworks of customers who checked out AND paid: the artwork saved
  // on the order's build, or the one frozen onto an order line at checkout.
  const paidRows = await prisma.$queryRaw<Array<{ artworkId: string; orderId: string; orderNumber: string }>>`
    SELECT DISTINCT ON (a.id) a.id AS "artworkId", o.id AS "orderId", o."orderNumber" AS "orderNumber"
    FROM "Artwork" a
    JOIN "Order" o ON o."paymentStatus" = 'PAID'
      AND (
        (o."buildId" IS NOT NULL AND o."buildId" = a."buildId")
        OR EXISTS (
          SELECT 1 FROM "OrderItem" i
          WHERE i."orderId" = o.id AND i.preview ->> 'savedArtworkId' = a.id
        )
      )
    ORDER BY a.id, o."paidAt" DESC NULLS LAST, o."createdAt" DESC`;
  const orderByArtwork = new Map(paidRows.map((row) => [row.artworkId, row]));
  const paidIds = paidRows.map((row) => row.artworkId);

  const baseWhere: Prisma.ArtworkWhereInput = show === "paid" ? { id: { in: paidIds } } : {};
  const where: Prisma.ArtworkWhereInput = q
    ? {
        AND: [
          baseWhere,
          { OR: [{ id: q }, { user: { email: { contains: q, mode: "insensitive" } } }, { prompt: { contains: q, mode: "insensitive" } }] },
        ],
      }
    : baseWhere;

  const [artworks, matchingCount] = await Promise.all([
    prisma.artwork.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      // Never select `data` here -- up to 10MB of bytes per row.
      select: {
        id: true,
        createdAt: true,
        mimeType: true,
        model: true,
        prompt: true,
        user: { select: { id: true, email: true } },
        build: { select: { draft: { select: { artworkLayers: true, primaryAssetId: true, artworkPlacement: true } } } },
        _count: { select: { wishlistItems: true, bespokeRequests: true, draftsUsingAsSaved: true } },
      },
    }),
    prisma.artwork.count({ where }),
  ]);
  const totalCount = await prisma.artwork.count(show === "paid" ? { where: { id: { in: paidIds } } } : undefined);

  const ids = artworks.map((artwork) => artwork.id);
  const sizeRows = ids.length
    ? await prisma.$queryRaw<Array<{ id: string; size: number }>>`SELECT id, octet_length(data)::int AS size FROM "Artwork" WHERE id = ANY(${ids}::text[])`
    : [];
  const sizeById = new Map(sizeRows.map((row) => [row.id, row.size]));
  // The ORIGINAL files the customer uploaded and placed on each mockup (and,
  // for a cropped upload, the uncropped original too).
  const layersByArtwork = new Map(
    artworks.map((artwork) => [artwork.id, artwork.build?.draft ? draftArtworkLayers(artwork.build.draft) : []]),
  );
  const placedIds = [...new Set([...layersByArtwork.values()].flatMap((layers) => layers.map((layer) => layer.assetId)))];
  const placedAssets = placedIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: placedIds } },
        select: { id: true, fileName: true, sizeBytes: true, cropSourceAssetId: true },
      })
    : [];
  const sourceIds = [...new Set(placedAssets.map((asset) => asset.cropSourceAssetId).filter((id): id is string => Boolean(id)))];
  const sourceAssets = sourceIds.length
    ? await prisma.asset.findMany({ where: { id: { in: sourceIds } }, select: { id: true, fileName: true, sizeBytes: true, cropSourceAssetId: true } })
    : [];
  const assetById = new Map([...placedAssets, ...sourceAssets].map((asset) => [asset.id, asset]));
  const downloadsFor = (artworkId: string) => {
    const out: Array<{ key: string; id: string; label: string; fileName: string; sizeBytes: number | null }> = [];
    for (const layer of layersByArtwork.get(artworkId) ?? []) {
      const asset = assetById.get(layer.assetId);
      if (!asset) continue;
      const where = placementLabel(layer.placement);
      const original = asset.cropSourceAssetId ? assetById.get(asset.cropSourceAssetId) : null;
      out.push({ key: `${layer.placement}-${asset.id}`, id: asset.id, label: original ? `${where} (cropped)` : where, fileName: asset.fileName, sizeBytes: asset.sizeBytes });
      if (original) out.push({ key: `${layer.placement}-${original.id}-src`, id: original.id, label: `${where} (uncropped original)`, fileName: original.fileName, sizeBytes: original.sizeBytes });
    }
    return out;
  };

  const totalBytes =
    show === "paid"
      ? await prisma.$queryRaw<Array<{ total: bigint | null }>>`SELECT SUM(octet_length(data)) AS total FROM "Artwork" WHERE id = ANY(${paidIds}::text[])`
      : await prisma.$queryRaw<Array<{ total: bigint | null }>>`SELECT SUM(octet_length(data)) AS total FROM "Artwork"`;
  const storedBytes = Number(totalBytes[0]?.total ?? 0);

  const pageCount = getPageCount(matchingCount, PAGE_SIZE);
  if (page > pageCount) redirect(pageHref("/admin/artworks", { q, show: show === "paid" ? "paid" : undefined }, pageCount));
  const listHref = pageHref("/admin/artworks", { q, show: show === "paid" ? "paid" : undefined }, page);

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Catalog" title="Artworks" subtitle="Every design customers saved in the Studio (model wearing the artwork). Switch to Paid orders to see only customers who checked out and paid. Stored compressed; download any of them." />

        <section className="mt-7 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
          <StatCard label={show === "paid" ? "Paid-order artworks" : "Saved artworks"} value={totalCount} tone="dark" />
          <StatCard label="Storage used" value={formatBytes(storedBytes)} />
          <StatCard label="Matching search" value={matchingCount} />
        </section>

        <Card className="mt-6" padded={false}>
          <div className="flex gap-2 border-b border-admin-border p-4 pb-0">
            {([["all", "All saved"], ["paid", "Paid orders"]] as const).map(([key, label]) => (
              <Link
                key={key}
                href={pageHref("/admin/artworks", { q, show: key === "paid" ? "paid" : undefined }, 1)}
                aria-current={show === key ? "page" : undefined}
                className={`-mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold ${show === key ? "border-admin-border bg-white text-admin-ink" : "border-transparent text-admin-muted hover:text-admin-ink"}`}
              >
                {label}
              </Link>
            ))}
          </div>
          <form className="border-b border-admin-border p-4">
            {show === "paid" ? <input type="hidden" name="show" value="paid" /> : null}
            <div className="flex max-w-xl gap-2">
              <SearchField name="q" defaultValue={q} placeholder="Search owner email, prompt, or artwork id…" />
              <button className={buttonClass()}>Search</button>
            </div>
          </form>
          <form action={compressArtworksAction} className="flex flex-wrap items-center gap-3 border-b border-admin-border p-4 text-xs text-admin-muted">
            <input type="hidden" name="returnTo" value={listHref} />
            <ConfirmSubmitButton size="sm" confirmMessage="Compress up to 25 stored artworks that are still full-size? Images are re-encoded as WebP (max 1600px).">
              Compress full-size images
            </ConfirmSubmitButton>
            <span>New artworks are compressed automatically; this shrinks the older ones (25 at a time).</span>
            <a
              href={`/api/admin/artworks/zip${show === "paid" || q ? `?${new URLSearchParams({ ...(show === "paid" ? { show: "paid" } : {}), ...(q ? { q } : {}) }).toString()}` : ""}`}
              download
              className={buttonClass({ variant: "outline", size: "sm", className: "ml-auto" })}
            >
              Download all ({matchingCount}) as ZIP
            </a>
          </form>

          {artworks.length ? (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {artworks.map((artwork) => {
                const blocked = artwork._count.bespokeRequests > 0;
                return (
                  <div key={artwork.id} className="flex flex-col overflow-hidden rounded-xl border border-admin-border">
                    <a href={`/api/artworks/${artwork.id}/file`} target="_blank" rel="noreferrer" className="block aspect-square bg-admin-canvas">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/artworks/${artwork.id}/file`} alt="Customer artwork" loading="lazy" className="h-full w-full object-contain" />
                    </a>
                    <div className="flex flex-1 flex-col gap-2 p-3 text-xs">
                      <p className="line-clamp-2 min-h-[2rem] text-admin-muted">{artwork.prompt ?? "No prompt recorded"}</p>
                      <p className="truncate text-admin-faint">
                        {artwork.user ? <Link href={`/admin/users/${artwork.user.id}`} className="font-semibold text-admin-ink hover:underline">{artwork.user.email ?? "No email"}</Link> : "Guest"}
                        {" · "}{artwork.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge>{formatBytes(sizeById.get(artwork.id) ?? 0)}</Badge>
                        {artwork._count.wishlistItems ? <Badge tone="info">{artwork._count.wishlistItems} wishlist</Badge> : null}
                        {artwork._count.draftsUsingAsSaved ? <Badge tone="info">{artwork._count.draftsUsingAsSaved} project</Badge> : null}
                        {blocked ? <Badge tone="warning">{artwork._count.bespokeRequests} bespoke</Badge> : null}
                      </div>
                      {orderByArtwork.get(artwork.id) ? (
                        <p className="truncate text-admin-faint">
                          Paid order{" "}
                          <Link href={`/admin/orders/${orderByArtwork.get(artwork.id)!.orderId}`} className="font-semibold text-admin-ink hover:underline">
                            #{orderByArtwork.get(artwork.id)!.orderNumber}
                          </Link>
                        </p>
                      ) : null}
                      <div className="flex flex-col gap-1.5">
                        <a
                          href={`/api/admin/artworks/${artwork.id}/zip`}
                          download
                          className={buttonClass({ size: "sm", className: "w-full" })}
                        >
                          Download all files (ZIP)
                        </a>
                        <a
                          href={`/api/artworks/${artwork.id}/file?download=1`}
                          download
                          className={buttonClass({ size: "sm", variant: "secondary", className: "w-full" })}
                        >
                          Download mockup
                        </a>
                        {downloadsFor(artwork.id).map((file) => (
                          <a
                            key={file.key}
                            href={`/api/assets/${file.id}/file?download=1`}
                            download
                            title={file.fileName}
                            className={buttonClass({ size: "sm", variant: "outline", className: "w-full" })}
                          >
                            <span className="truncate">Original upload · {file.label}</span>
                          </a>
                        ))}
                      </div>
                      <form action={deleteArtworkAction} className="pt-1">
                        <input type="hidden" name="id" value={artwork.id} />
                        <input type="hidden" name="returnTo" value={listHref} />
                        <ConfirmSubmitButton size="sm" className="w-full" confirmMessage="Permanently delete this artwork? Wishlist items and projects using it will lose it. This can't be undone.">
                          Delete artwork
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title={q ? "No artworks match your search" : show === "paid" ? "No paid-order artworks yet" : "No saved artworks yet"} />
          )}
          {artworks.length ? <Pagination page={page} pageSize={PAGE_SIZE} total={matchingCount} basePath="/admin/artworks" params={{ q, show: show === "paid" ? "paid" : undefined }} /> : null}
        </Card>
      </div>
    </main>
  );
}
