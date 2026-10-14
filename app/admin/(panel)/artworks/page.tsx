import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { deleteArtworkAction } from "src/actions/admin-artwork-actions";
import AdminToast from "src/components/admin/AdminToast";
import { prisma } from "src/lib/prisma";
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
  searchParams: Promise<{ q?: string; page?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 120);
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const where: Prisma.ArtworkWhereInput | undefined = q
    ? { OR: [{ id: q }, { user: { email: { contains: q, mode: "insensitive" } } }, { prompt: { contains: q, mode: "insensitive" } }] }
    : undefined;

  const [artworks, matchingCount, totalCount] = await Promise.all([
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
        _count: { select: { wishlistItems: true, bespokeRequests: true, draftsUsingAsSaved: true } },
      },
    }),
    prisma.artwork.count({ where }),
    prisma.artwork.count(),
  ]);

  const ids = artworks.map((artwork) => artwork.id);
  const sizeRows = ids.length
    ? await prisma.$queryRaw<Array<{ id: string; size: number }>>`SELECT id, octet_length(data)::int AS size FROM "Artwork" WHERE id = ANY(${ids}::text[])`
    : [];
  const sizeById = new Map(sizeRows.map((row) => [row.id, row.size]));
  const totalBytes = await prisma.$queryRaw<Array<{ total: bigint | null }>>`SELECT SUM(octet_length(data)) AS total FROM "Artwork"`;
  const storedBytes = Number(totalBytes[0]?.total ?? 0);

  const pageCount = getPageCount(matchingCount, PAGE_SIZE);
  if (page > pageCount) redirect(pageHref("/admin/artworks", { q }, pageCount));
  const listHref = pageHref("/admin/artworks", { q }, page);

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Catalog" title="Artworks" subtitle="AI-generated artwork customers saved in the Studio. Review what people are making and remove anything that shouldn't be there." />

        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          <StatCard label="Saved artworks" value={totalCount} tone="dark" />
          <StatCard label="Storage used" value={formatBytes(storedBytes)} />
          <StatCard label="Matching search" value={matchingCount} />
        </section>

        <Card className="mt-6" padded={false}>
          <form className="border-b border-admin-border p-4">
            <div className="flex max-w-xl gap-2">
              <SearchField name="q" defaultValue={q} placeholder="Search owner email, prompt, or artwork id…" />
              <button className={buttonClass()}>Search</button>
            </div>
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
                      <form action={deleteArtworkAction} className="mt-auto pt-1">
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
            <EmptyState title={q ? "No artworks match your search" : "No saved artworks yet"} />
          )}
          {artworks.length ? <Pagination page={page} pageSize={PAGE_SIZE} total={matchingCount} basePath="/admin/artworks" params={{ q }} /> : null}
        </Card>
      </div>
    </main>
  );
}
