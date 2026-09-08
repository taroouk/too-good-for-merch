import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import PageHeader from "src/components/admin/ui/PageHeader";
import StatCard from "src/components/admin/ui/StatCard";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import Input, { Label } from "src/components/admin/ui/Input";
import SearchField from "src/components/admin/ui/SearchField";
import EmptyState from "src/components/admin/ui/EmptyState";
import Pagination, { getPageCount, pageHref } from "src/components/admin/ui/Pagination";
import { Table, Tbody, Td, Th, Thead } from "src/components/admin/ui/Table";
import TableCardSwitch from "src/components/admin/ui/TableCardSwitch";
import { buttonClass } from "src/components/admin/ui/Button";
import { ORDER_STATUS_LABELS, orderStatusTone, paymentStatusTone } from "src/components/admin/ui/status";
import { ORDER_TOTAL_FILTER_HINT, orderTotalFilterLabel } from "src/lib/orders/display";

const PAGE_SIZE = 25;

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

const FILTERS = ["all", "pending", "paid", "failed", "refunded"] as const;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; minTotal?: string; maxTotal?: string; page?: string }>;
}) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 120);
  const filter = (query.status ?? "all").toLowerCase();
  const from = query.from ?? "";
  const to = query.to ?? "";
  const minTotal = query.minTotal ?? "";
  const maxTotal = query.maxTotal ?? "";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const statusWhere: Prisma.EnumPaymentStatusFilter | undefined = filter === "pending"
    ? { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] }
    : ["paid", "failed", "refunded"].includes(filter)
      ? { equals: filter.toUpperCase() as PaymentStatus }
      : undefined;
  const createdAtWhere: Prisma.DateTimeFilter | undefined = from || to
    ? {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      }
    : undefined;
  const minCents = Number(minTotal);
  const maxCents = Number(maxTotal);
  const totalCentsWhere: Prisma.IntFilter | undefined = minTotal || maxTotal
    ? {
        ...(minTotal && Number.isFinite(minCents) ? { gte: Math.round(minCents * 100) } : {}),
        ...(maxTotal && Number.isFinite(maxCents) ? { lte: Math.round(maxCents * 100) } : {}),
      }
    : undefined;
  const where: Prisma.OrderWhereInput = {
    ...(statusWhere ? { paymentStatus: statusWhere } : {}),
    ...(createdAtWhere ? { createdAt: createdAtWhere } : {}),
    ...(totalCentsWhere ? { totalCents: totalCentsWhere } : {}),
    ...(q ? { OR: [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };

  const [orders, matchingCount, statusCounts] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { items: true, notes: { select: { id: true } } } }),
    prisma.order.count({ where }),
    // Global counts, independent of the current filters -- an overview
    // that stays stable while the table below is filtered.
    prisma.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const countByStatus = new Map(statusCounts.map((row) => [row.status, row._count]));
  const totalOrderCount = statusCounts.reduce((sum, row) => sum + row._count, 0);
  const paramsForPagination = { q, status: filter, from, to, minTotal, maxTotal };
  const hasActiveFilters = Boolean(q || filter !== "all" || from || to || minTotal || maxTotal);

  // A stale `?page=` (bookmarked, or left over after filters shrank the
  // result set) would otherwise render an empty table with a misleading
  // "no orders match" message even though earlier pages have results --
  // resolve it to the last real page instead of rendering that state.
  const pageCount = getPageCount(matchingCount, PAGE_SIZE);
  if (page > pageCount) {
    redirect(pageHref("/admin/orders", paramsForPagination, pageCount));
  }

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Operations"
          title="Orders"
          subtitle="Search, filter, review, and export customer orders."
          actions={
            <a href={`/api/admin/orders/export?status=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}`} className={buttonClass({ variant: "outline" })}>
              Export CSV ↓
            </a>
          }
        />

        <section className="mt-7 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total" value={totalOrderCount} tone="dark" />
          <StatCard label="Pending" value={countByStatus.get(OrderStatus.NEW) ?? 0} tone="warning" />
          <StatCard label="Paid" value={countByStatus.get(OrderStatus.PAID) ?? 0} tone="success" />
          <StatCard label="Processing" value={countByStatus.get(OrderStatus.IN_PRODUCTION) ?? 0} tone="info" />
          <StatCard label="Completed" value={countByStatus.get(OrderStatus.COMPLETED) ?? 0} />
          <StatCard label="Cancelled" value={countByStatus.get(OrderStatus.CANCELLED) ?? 0} tone="danger" />
        </section>

        <Card className="mt-6" padded={false}>
          <form className="flex flex-col gap-3 border-b border-admin-border p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex max-w-xl flex-1 gap-2">
                <SearchField name="q" defaultValue={q} placeholder="Search order, customer, or phone…" />
                <input type="hidden" name="status" value={filter} />
                <button className={buttonClass()}>Search</button>
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {FILTERS.map((item) => (
                  <Link
                    key={item}
                    href={`/admin/orders?status=${item}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                    className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold capitalize ${filter === item ? "bg-admin-ink text-white" : "bg-black/5 text-admin-muted"}`}
                  >
                    {item}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 border-t border-admin-border pt-3">
              <Label>
                <span className="text-xs font-medium text-admin-muted">From</span>
                <Input type="date" name="from" defaultValue={from} className="mt-1 h-9 w-auto" />
              </Label>
              <Label>
                <span className="text-xs font-medium text-admin-muted">To</span>
                <Input type="date" name="to" defaultValue={to} className="mt-1 h-9 w-auto" />
              </Label>
              <Label>
                <span className="text-xs font-medium text-admin-muted">{orderTotalFilterLabel("Min")}</span>
                <Input type="number" step="0.01" min="0" name="minTotal" defaultValue={minTotal} placeholder="0.00" className="mt-1 h-9 w-28" />
              </Label>
              <Label>
                <span className="text-xs font-medium text-admin-muted">{orderTotalFilterLabel("Max")}</span>
                <Input type="number" step="0.01" min="0" name="maxTotal" defaultValue={maxTotal} placeholder="0.00" className="mt-1 h-9 w-28" />
              </Label>
              <button className={buttonClass({ variant: "outline", size: "sm" })}>Apply</button>
              {from || to || minTotal || maxTotal ? (
                <Link href={`/admin/orders?status=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="text-xs font-semibold text-admin-faint underline">
                  Clear date/amount filters
                </Link>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-admin-faint">{ORDER_TOTAL_FILTER_HINT}</p>
          </form>

          <TableCardSwitch
            minWidth={1080}
            table={
              <Table minWidth={1080}>
                <Thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Customer</Th>
                    <Th>Date</Th>
                    <Th>Payment</Th>
                    <Th>Fulfillment</Th>
                    <Th align="right">Total</Th>
                    <Th />
                  </tr>
                </Thead>
                <Tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="transition hover:bg-black/[.018]">
                      <Td>
                        <p className="font-semibold text-admin-ink">{order.orderNumber}</p>
                        <p className="mt-1 text-xs text-admin-faint">{order.items.length} item{order.items.length === 1 ? "" : "s"} · {order.notes.length} note{order.notes.length === 1 ? "" : "s"}</p>
                      </Td>
                      <Td>
                        <p className="font-medium text-admin-ink">{order.customerName ?? "No name"}</p>
                        <p className="mt-1 text-xs text-admin-faint">{order.customerPhone ?? order.customerEmail ?? "—"}</p>
                      </Td>
                      <Td className="text-admin-muted">{order.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</Td>
                      <Td><Badge tone={paymentStatusTone(order.paymentStatus)}>{order.paymentStatus}</Badge></Td>
                      <Td><Badge tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge></Td>
                      <Td align="right" className="font-semibold text-admin-ink">{money(order.totalCents, order.currency)}</Td>
                      <Td align="right">
                        <Link href={`/admin/orders/${order.id}`} className={buttonClass({ variant: "outline", size: "sm" })}>View →</Link>
                      </Td>
                    </tr>
                  ))}
                </Tbody>
              </Table>
            }
            cards={
              <div className="divide-y divide-admin-border">
                {orders.map((order) => (
                  <Link key={order.id} href={`/admin/orders/${order.id}`} className="block px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-admin-ink">{order.orderNumber}</p>
                        <p className="mt-1 text-xs text-admin-faint">{order.customerName ?? "No name"}</p>
                      </div>
                      <p className="shrink-0 font-semibold text-admin-ink">{money(order.totalCents, order.currency)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone={paymentStatusTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
                      <Badge tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                      <span className="text-xs text-admin-faint">{order.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                    </div>
                  </Link>
                ))}
              </div>
            }
          />

          {!orders.length ? (
            <EmptyState
              title={hasActiveFilters ? "No orders match your filters" : "No orders yet"}
              description={hasActiveFilters ? "Try widening your search or clearing a filter." : "Orders will show up here as customers check out."}
            />
          ) : null}
          {orders.length ? <Pagination page={page} pageSize={PAGE_SIZE} total={matchingCount} basePath="/admin/orders" params={paramsForPagination} /> : null}
        </Card>
      </div>
    </main>
  );
}
