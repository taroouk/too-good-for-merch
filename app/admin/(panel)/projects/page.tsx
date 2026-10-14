import Link from "next/link";
import { redirect } from "next/navigation";
import { BuildStatus, Prisma } from "@prisma/client";
import { setProjectArchivedAction } from "src/actions/admin-project-actions";
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
import { Table, Tbody, Td, Th, Thead } from "src/components/admin/ui/Table";
import TableCardSwitch from "src/components/admin/ui/TableCardSwitch";
import { buttonClass } from "src/components/admin/ui/Button";

const PAGE_SIZE = 25;
const FILTERS = ["all", "active", "archived"] as const;

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 120);
  const filter = (FILTERS as readonly string[]).includes(query.status ?? "") ? (query.status as string) : "all";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const where: Prisma.BuildWhereInput = {
    ...(filter === "active" ? { status: BuildStatus.ACTIVE } : filter === "archived" ? { status: BuildStatus.ARCHIVED } : {}),
    ...(q ? { OR: [{ id: q }, { name: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {}),
  };

  const [builds, matchingCount, statusCounts] = await Promise.all([
    prisma.build.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        user: { select: { id: true, email: true } },
        draft: { select: { product: true, fabric: true, color: true, quantity: true } },
        _count: { select: { orders: true, bespokeRequests: true } },
      },
    }),
    prisma.build.count({ where }),
    prisma.build.groupBy({ by: ["status"], _count: true }),
  ]);
  const countByStatus = new Map(statusCounts.map((row) => [row.status, row._count]));
  const paramsForPagination = { q, status: filter === "all" ? undefined : filter };
  const pageCount = getPageCount(matchingCount, PAGE_SIZE);
  if (page > pageCount) redirect(pageHref("/admin/projects", paramsForPagination, pageCount));
  const listHref = pageHref("/admin/projects", paramsForPagination, page);

  const spec = (build: (typeof builds)[number]) =>
    build.draft ? [build.draft.product, build.draft.fabric, build.draft.color].filter(Boolean).join(" · ") || "Not configured" : "No draft";
  const owner = (build: (typeof builds)[number]) =>
    build.user ? <Link href={`/admin/users/${build.user.id}`} className="font-semibold text-admin-ink hover:underline">{build.user.email ?? "No email"}</Link> : <span className="text-admin-faint">Guest</span>;
  const archiveForm = (build: (typeof builds)[number]) => (
    <form action={setProjectArchivedAction}>
      <input type="hidden" name="id" value={build.id} />
      <input type="hidden" name="archive" value={build.status === BuildStatus.ARCHIVED ? "false" : "true"} />
      <input type="hidden" name="returnTo" value={listHref} />
      {build.status === BuildStatus.ARCHIVED ? (
        <button className={buttonClass({ variant: "secondary", size: "sm" })}>Restore</button>
      ) : (
        <ConfirmSubmitButton size="sm" confirmMessage={`Archive "${build.name ?? "Untitled project"}"? It will be hidden from the customer's project list (direct links still open).`}>Archive</ConfirmSubmitButton>
      )}
    </form>
  );

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Catalog" title="Projects" subtitle="Customer Studio projects. Archive anything that needs hiding — projects with orders are never deleted." />

        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          <StatCard label="All projects" value={(countByStatus.get(BuildStatus.ACTIVE) ?? 0) + (countByStatus.get(BuildStatus.ARCHIVED) ?? 0)} tone="dark" />
          <StatCard label="Active" value={countByStatus.get(BuildStatus.ACTIVE) ?? 0} tone="success" />
          <StatCard label="Archived" value={countByStatus.get(BuildStatus.ARCHIVED) ?? 0} />
        </section>

        <Card className="mt-6" padded={false}>
          <form className="flex flex-col gap-3 border-b border-admin-border p-4 sm:flex-row sm:items-center">
            <div className="flex max-w-xl flex-1 gap-2">
              <SearchField name="q" defaultValue={q} placeholder="Search project name, owner email, or id…" />
              <input type="hidden" name="status" value={filter} />
              <button className={buttonClass()}>Search</button>
            </div>
            <div className="flex gap-2">
              {FILTERS.map((item) => (
                <Link key={item} href={pageHref("/admin/projects", { q, status: item === "all" ? undefined : item }, 1)} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${filter === item ? "bg-admin-ink text-white" : "bg-black/5 text-admin-muted"}`}>
                  {item}
                </Link>
              ))}
            </div>
          </form>

          <TableCardSwitch
            minWidth={900}
            table={
              <Table minWidth={900}>
                <Thead>
                  <tr>
                    <Th>Project</Th>
                    <Th>Owner</Th>
                    <Th>Configuration</Th>
                    <Th>Orders</Th>
                    <Th>Updated</Th>
                    <Th>Status</Th>
                    <Th />
                  </tr>
                </Thead>
                <Tbody>
                  {builds.map((build) => (
                    <tr key={build.id}>
                      <Td>
                        <p className="font-semibold text-admin-ink">{build.name ?? "Untitled project"}</p>
                        <p className="mt-1 font-mono text-[10px] text-admin-faint">{build.id}</p>
                      </Td>
                      <Td>{owner(build)}</Td>
                      <Td className="text-xs text-admin-muted">{spec(build)}{build.draft ? ` · ×${build.draft.quantity}` : ""}</Td>
                      <Td className="text-xs text-admin-muted">{build._count.orders} order{build._count.orders === 1 ? "" : "s"}{build._count.bespokeRequests ? ` · ${build._count.bespokeRequests} bespoke` : ""}</Td>
                      <Td className="text-admin-muted">{build.updatedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</Td>
                      <Td><Badge tone={build.status === BuildStatus.ARCHIVED ? "neutral" : "success"}>{build.status}</Badge></Td>
                      <Td align="right">{archiveForm(build)}</Td>
                    </tr>
                  ))}
                </Tbody>
              </Table>
            }
            cards={
              <div className="divide-y divide-admin-border">
                {builds.map((build) => (
                  <div key={build.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-admin-ink">{build.name ?? "Untitled project"}</p>
                        <p className="mt-1 text-xs text-admin-faint">{owner(build)} · {spec(build)}</p>
                      </div>
                      <Badge tone={build.status === BuildStatus.ARCHIVED ? "neutral" : "success"}>{build.status}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-admin-faint">
                      <span>{build._count.orders} orders · {build.updatedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                      {archiveForm(build)}
                    </div>
                  </div>
                ))}
              </div>
            }
          />
          {!builds.length ? <EmptyState title={q || filter !== "all" ? "No projects match your filters" : "No projects yet"} /> : null}
          {builds.length ? <Pagination page={page} pageSize={PAGE_SIZE} total={matchingCount} basePath="/admin/projects" params={paramsForPagination} /> : null}
        </Card>
      </div>
    </main>
  );
}
