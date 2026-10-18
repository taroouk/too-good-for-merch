import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import PageHeader from "src/components/admin/ui/PageHeader";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import EmptyState from "src/components/admin/ui/EmptyState";
import Input, { Select } from "src/components/admin/ui/Input";
import Pagination, { getPageCount, pageHref } from "src/components/admin/ui/Pagination";
import { Table, Tbody, Td, Th, Thead } from "src/components/admin/ui/Table";
import TableCardSwitch from "src/components/admin/ui/TableCardSwitch";
import { buttonClass } from "src/components/admin/ui/Button";
import type { BadgeTone } from "src/components/admin/ui/Badge";

const PAGE_SIZE = 40;

function actionLabel(action: string) {
  return action.toLowerCase().replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

function actionTone(action: string): BadgeTone {
  if (/DELETED|BLOCKED|DEMOTED|CLEARED|FAILED/.test(action) && !/UNBLOCKED/.test(action)) return "danger";
  if (/PROMOTED|SETTINGS|PRICING|QUOTE|REGENERATED/.test(action)) return "warning";
  if (/STATUS/.test(action)) return "info";
  return "neutral";
}

function describeMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  return Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ")
    .slice(0, 220);
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; admin?: string; from?: string; to?: string; page?: string }>;
}) {
  const query = await searchParams;
  const actionFilter = (query.action ?? "").slice(0, 80);
  const adminFilter = (query.admin ?? "").slice(0, 100);
  const from = query.from ?? "";
  const to = query.to ?? "";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const createdAt: Prisma.DateTimeFilter | undefined =
    (validDate(from) || validDate(to))
      ? {
          ...(validDate(from) ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          ...(validDate(to) ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
        }
      : undefined;
  const where: Prisma.AdminAuditLogWhereInput = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(adminFilter ? { adminId: adminFilter } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const [entries, matchingCount, actionGroups, admins] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        admin: { select: { email: true } },
        order: { select: { id: true, orderNumber: true } },
        bespokeRequest: { select: { id: true, requestNumber: true } },
      },
    }),
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.groupBy({ by: ["action"], _count: true, orderBy: { action: "asc" } }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true }, orderBy: { email: "asc" } }),
  ]);

  const paramsForPagination = { action: actionFilter, admin: adminFilter, from, to };
  const hasFilters = Boolean(actionFilter || adminFilter || from || to);
  const pageCount = getPageCount(matchingCount, PAGE_SIZE);
  if (page > pageCount) redirect(pageHref("/admin/audit", paramsForPagination, pageCount));

  function target(entry: (typeof entries)[number]) {
    if (entry.order) return <Link href={`/admin/orders/${entry.order.id}`} className="font-semibold hover:underline">{entry.order.orderNumber}</Link>;
    if (entry.bespokeRequest) return <Link href={`/admin/bespoke/${entry.bespokeRequest.id}`} className="font-semibold hover:underline">{entry.bespokeRequest.requestNumber}</Link>;
    return <span className="text-admin-faint">—</span>;
  }
  function change(entry: (typeof entries)[number]) {
    if (entry.previousValue == null && entry.newValue == null) return null;
    return `${entry.previousValue ?? "—"} → ${entry.newValue ?? "—"}`;
  }

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="System" title="Audit Log" subtitle="Every admin action that changes orders, payments, pricing, settings, quotes, or access — who did what, and when." />

        <Card className="mt-7" padded={false}>
          <form className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
            <div className="min-w-[180px]">
              <p className="mb-1 text-xs font-medium text-admin-muted">Action</p>
              <Select name="action" defaultValue={actionFilter} className="h-9">
                <option value="">All actions</option>
                {actionGroups.map((group) => <option key={group.action} value={group.action}>{actionLabel(group.action)} ({group._count})</option>)}
              </Select>
            </div>
            <div className="min-w-[180px]">
              <p className="mb-1 text-xs font-medium text-admin-muted">Admin</p>
              <Select name="admin" defaultValue={adminFilter} className="h-9">
                <option value="">Everyone</option>
                {admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.email ?? admin.id}</option>)}
              </Select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-admin-muted">From</p>
              <Input type="date" name="from" defaultValue={from} className="h-9 w-auto" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-admin-muted">To</p>
              <Input type="date" name="to" defaultValue={to} className="h-9 w-auto" />
            </div>
            <button className={buttonClass({ variant: "outline", size: "sm" })}>Filter</button>
            {hasFilters ? <Link href="/admin/audit" className="flex h-9 items-center px-2 text-xs font-semibold text-admin-faint underline">Clear</Link> : null}
          </form>
        </Card>

        <Card className="mt-6" padded={false}>
          <TableCardSwitch
            minWidth={900}
            table={
              <Table minWidth={900}>
                <Thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Admin</Th>
                    <Th>Action</Th>
                    <Th>Target</Th>
                    <Th>Details</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <Td className="whitespace-nowrap text-admin-muted">{entry.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Td>
                      <Td className="text-admin-ink">{entry.admin?.email ?? <span className="text-admin-faint">Removed admin</span>}</Td>
                      <Td><Badge tone={actionTone(entry.action)}>{actionLabel(entry.action)}</Badge></Td>
                      <Td>{target(entry)}</Td>
                      <Td className="max-w-md text-xs text-admin-faint">
                        {change(entry) ? <p className="font-mono text-admin-muted">{change(entry)}</p> : null}
                        {describeMetadata(entry.metadata) ? <p className="mt-0.5 break-words">{describeMetadata(entry.metadata)}</p> : null}
                      </Td>
                    </tr>
                  ))}
                </Tbody>
              </Table>
            }
            cards={
              <div className="divide-y divide-admin-border">
                {entries.map((entry) => (
                  <div key={entry.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <Badge tone={actionTone(entry.action)}>{actionLabel(entry.action)}</Badge>
                      <span className="text-xs text-admin-faint">{entry.createdAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                    <p className="mt-2 text-xs text-admin-muted">{entry.admin?.email ?? "Removed admin"} · {target(entry)}</p>
                    {change(entry) ? <p className="mt-1 font-mono text-xs text-admin-muted">{change(entry)}</p> : null}
                    {describeMetadata(entry.metadata) ? <p className="mt-1 break-words text-xs text-admin-faint">{describeMetadata(entry.metadata)}</p> : null}
                  </div>
                ))}
              </div>
            }
          />
          {!entries.length ? <EmptyState title={hasFilters ? "No entries match your filters" : "No admin activity recorded yet"} /> : null}
          {entries.length ? <Pagination page={page} pageSize={PAGE_SIZE} total={matchingCount} basePath="/admin/audit" params={paramsForPagination} /> : null}
        </Card>
      </div>
    </main>
  );
}
