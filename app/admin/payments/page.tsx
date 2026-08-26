import Link from "next/link";
import { redirect } from "next/navigation";
import { PaymentAttemptStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import AdminToast from "src/components/admin/AdminToast";
import { generateRetryPaymentLinkAction } from "src/actions/admin-system-actions";
import PageHeader from "src/components/admin/ui/PageHeader";
import StatCard from "src/components/admin/ui/StatCard";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import SearchField from "src/components/admin/ui/SearchField";
import Input, { Select } from "src/components/admin/ui/Input";
import EmptyState from "src/components/admin/ui/EmptyState";
import Pagination, { getPageCount, pageHref } from "src/components/admin/ui/Pagination";
import { Table, Tbody, Td, Th, Thead } from "src/components/admin/ui/Table";
import TableCardSwitch from "src/components/admin/ui/TableCardSwitch";
import { buttonClass } from "src/components/admin/ui/Button";
import { attemptStatusTone } from "src/components/admin/ui/status";

const PAGE_SIZE = 25;

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

const ATTEMPT_STATUS_FILTERS = ["all", "created", "pending", "succeeded", "failed"] as const;
const METHOD_FILTERS = ["all", "card", "wallet"] as const;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; q?: string; status?: string; method?: string; from?: string; to?: string; page?: string }>;
}) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 120);
  const statusFilter = (query.status ?? "all").toLowerCase();
  const methodFilter = (query.method ?? "all").toLowerCase();
  const from = query.from ?? "";
  const to = query.to ?? "";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const createdAtWhere: Prisma.DateTimeFilter | undefined = from || to
    ? {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      }
    : undefined;

  const attemptsWhere: Prisma.PaymentAttemptWhereInput = {
    ...(ATTEMPT_STATUS_FILTERS.includes(statusFilter as (typeof ATTEMPT_STATUS_FILTERS)[number]) && statusFilter !== "all"
      ? { status: statusFilter.toUpperCase() as PaymentAttemptStatus }
      : {}),
    ...(METHOD_FILTERS.includes(methodFilter as (typeof METHOD_FILTERS)[number]) && methodFilter !== "all"
      ? { method: methodFilter.toUpperCase() as PaymentMethod }
      : {}),
    ...(createdAtWhere ? { createdAt: createdAtWhere } : {}),
    ...(q
      ? {
          order: {
            OR: [
              { orderNumber: { contains: q, mode: "insensitive" } },
              { customerName: { contains: q, mode: "insensitive" } },
              { customerEmail: { contains: q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [attempts, matchingCount, webhooks, orderStatusCounts, revenue, refunded, latestPaidOrder] = await Promise.all([
    prisma.paymentAttempt.findMany({
      where: attemptsWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { order: { select: { id: true, orderNumber: true, customerName: true, paymentStatus: true, paymentFailureReason: true } } },
    }),
    prisma.paymentAttempt.count({ where: attemptsWhere }),
    prisma.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { order: { select: { id: true, orderNumber: true } } } }),
    // Order-level payment status is the authoritative, webhook-confirmed
    // source for the summary cards -- one order counted once, unlike the
    // attempts table below which can have several rows per order (retries).
    prisma.order.groupBy({ by: ["paymentStatus"], _count: true }),
    prisma.order.aggregate({ where: { paymentStatus: PaymentStatus.PAID }, _sum: { totalCents: true } }),
    prisma.order.aggregate({ where: { paymentStatus: PaymentStatus.REFUNDED }, _sum: { totalCents: true } }),
    prisma.order.findFirst({ where: { paymentStatus: PaymentStatus.PAID }, orderBy: { createdAt: "desc" }, select: { currency: true } }),
  ]);

  const countByPaymentStatus = new Map(orderStatusCounts.map((row) => [row.paymentStatus, row._count]));
  const pendingCount = (countByPaymentStatus.get(PaymentStatus.UNPAID) ?? 0) + (countByPaymentStatus.get(PaymentStatus.PENDING) ?? 0);
  // Orders can carry different currencies across the USD->EGP migration
  // (see src/lib/orders/checkout.ts) -- this labels the revenue sum with
  // whichever currency the most recent paid order actually used, same
  // simplification the /admin dashboard already makes, rather than
  // inventing a precise mixed-currency breakdown.
  const revenueCurrency = latestPaidOrder?.currency ?? "USD";
  const invalidWebhookCount = webhooks.filter((event) => !event.validSignature).length;

  const hasActiveFilters = Boolean(q || statusFilter !== "all" || methodFilter !== "all" || from || to);
  const paramsForPagination = { q, status: statusFilter, method: methodFilter, from, to };

  // See app/admin/orders/page.tsx for why an out-of-range page is resolved
  // to the last real page instead of rendering a misleading empty state.
  const pageCount = getPageCount(matchingCount, PAGE_SIZE);
  if (page > pageCount) {
    redirect(pageHref("/admin/payments", paramsForPagination, pageCount));
  }

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Paymob" title="Payments" subtitle="Revenue, payment status, and transaction activity across every order." />

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Revenue (paid)" value={money(revenue._sum.totalCents ?? 0, revenueCurrency)} hint={`Refunded ${money(refunded._sum.totalCents ?? 0, revenueCurrency)}`} tone="dark" />
          <StatCard label="Successful" value={countByPaymentStatus.get(PaymentStatus.PAID) ?? 0} tone="success" />
          <StatCard label="Pending" value={pendingCount} tone="warning" />
          <StatCard label="Failed" value={countByPaymentStatus.get(PaymentStatus.FAILED) ?? 0} tone="danger" />
          <StatCard label="Refunded" value={countByPaymentStatus.get(PaymentStatus.REFUNDED) ?? 0} tone="info" />
        </section>

        <Card className="mt-6" padded={false}>
          <form className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex max-w-xl flex-1 gap-2">
              <SearchField name="q" defaultValue={q} placeholder="Search order, customer, or email…" />
              <button className={buttonClass()}>Search</button>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-admin-border pt-3">
              {/* Each control is wrapped in a plain div rather than made a
                  direct flex child: Select/Input default to `w-full`, and as
                  a *direct* flex item that resolves its flex-basis to 100%
                  of the row, forcing every sibling onto its own line. A
                  wrapper with no width of its own is auto-sized instead
                  (mirrors how Orders' <Label> wrapper keeps its date/amount
                  fields compact), so the percentage width falls back to the
                  control's own intrinsic size. */}
              <div>
                <Select name="status" defaultValue={statusFilter} className="w-auto">
                  {ATTEMPT_STATUS_FILTERS.map((value) => <option key={value} value={value}>{value === "all" ? "All statuses" : value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
                </Select>
              </div>
              <div>
                <Select name="method" defaultValue={methodFilter} className="w-auto">
                  {METHOD_FILTERS.map((value) => <option key={value} value={value}>{value === "all" ? "All methods" : value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
                </Select>
              </div>
              <div>
                <Input type="date" name="from" defaultValue={from} className="w-auto" />
              </div>
              <div>
                <Input type="date" name="to" defaultValue={to} className="w-auto" />
              </div>
              <button className={buttonClass({ variant: "outline", size: "sm" })}>Filter</button>
              {hasActiveFilters ? <Link href="/admin/payments" className="flex h-9 items-center px-2 text-xs font-semibold text-admin-faint underline">Clear</Link> : null}
            </div>
          </form>
        </Card>

        <Card className="mt-6" padded={false} title="Recent transactions">
          <TableCardSwitch
            minWidth={1050}
            table={
              <Table minWidth={1050}>
                <Thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Created</Th>
                    <Th>Method</Th>
                    <Th>Status</Th>
                    <Th>Paymob ref</Th>
                    <Th>Amount</Th>
                    <Th>Reason / action</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <Td>
                        <Link href={`/admin/orders/${attempt.order.id}`} className="font-semibold text-admin-ink hover:underline">{attempt.order.orderNumber}</Link>
                        <p className="mt-1 text-xs text-admin-faint">{attempt.order.customerName ?? "Customer"}</p>
                      </Td>
                      <Td className="text-admin-muted">{attempt.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Td>
                      <Td className="text-xs font-semibold">{attempt.method}</Td>
                      <Td><Badge tone={attemptStatusTone(attempt.status)}>{attempt.status}</Badge></Td>
                      <Td className="max-w-[170px] truncate font-mono text-xs text-admin-faint">{attempt.externalId ?? "—"}</Td>
                      <Td className="font-semibold text-admin-ink">{money(attempt.amountCents, attempt.currency)}</Td>
                      <Td>
                        <p className="max-w-xs text-xs text-red-600">{attempt.failureReason ?? attempt.order.paymentFailureReason ?? "—"}</p>
                        {attempt.order.paymentStatus !== PaymentStatus.PAID && attempt.order.paymentStatus !== PaymentStatus.REFUNDED ? (
                          <form action={generateRetryPaymentLinkAction} className="mt-2">
                            <input type="hidden" name="orderId" value={attempt.order.id} />
                            <button className="text-xs font-semibold underline">Generate retry link</button>
                          </form>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </Tbody>
              </Table>
            }
            cards={
              <div className="divide-y divide-admin-border">
                {attempts.map((attempt) => (
                  <div key={attempt.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/admin/orders/${attempt.order.id}`} className="font-semibold text-admin-ink hover:underline">{attempt.order.orderNumber}</Link>
                        <p className="mt-1 text-xs text-admin-faint">{attempt.order.customerName ?? "Customer"} · {attempt.method}</p>
                      </div>
                      <p className="shrink-0 font-semibold text-admin-ink">{money(attempt.amountCents, attempt.currency)}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Badge tone={attemptStatusTone(attempt.status)}>{attempt.status}</Badge>
                      <span className="text-xs text-admin-faint">{attempt.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                    </div>
                    {attempt.order.paymentStatus !== PaymentStatus.PAID && attempt.order.paymentStatus !== PaymentStatus.REFUNDED ? (
                      <form action={generateRetryPaymentLinkAction} className="mt-3">
                        <input type="hidden" name="orderId" value={attempt.order.id} />
                        <button className="text-xs font-semibold underline">Generate retry link</button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            }
          />

          {!attempts.length ? (
            <EmptyState title={hasActiveFilters ? "No transactions match your filters" : "No payment attempts yet"} />
          ) : null}
          {attempts.length ? <Pagination page={page} pageSize={PAGE_SIZE} total={matchingCount} basePath="/admin/payments" params={paramsForPagination} /> : null}
        </Card>

        <Card
          className="mt-6"
          padded={false}
          title="Webhook log"
          subtitle={`Invalid signatures are retained for investigation and never update orders. ${invalidWebhookCount} invalid signature${invalidWebhookCount === 1 ? "" : "s"} in the last ${webhooks.length} event${webhooks.length === 1 ? "" : "s"}.`}
        >
          <TableCardSwitch
            minWidth={900}
            table={
              <Table minWidth={900}>
                <Thead>
                  <tr>
                    <Th>Received</Th>
                    <Th>Event</Th>
                    <Th>Order</Th>
                    <Th>Signature</Th>
                    <Th>Processed</Th>
                    <Th>Transaction</Th>
                    <Th>Error</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {webhooks.map((event) => (
                    <tr key={event.id}>
                      <Td className="text-admin-muted">{event.createdAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</Td>
                      <Td className="font-semibold text-admin-ink">{event.eventType}</Td>
                      <Td>{event.order ? <Link href={`/admin/orders/${event.order.id}`} className="font-semibold hover:underline">{event.order.orderNumber}</Link> : "—"}</Td>
                      <Td><Badge tone={event.validSignature ? "success" : "danger"}>{event.validSignature ? "Valid" : "Rejected"}</Badge></Td>
                      <Td>{event.processed ? "Yes" : "No"}</Td>
                      <Td className="font-mono text-xs text-admin-faint">{event.transactionId ?? "—"}</Td>
                      <Td className="text-xs text-red-600">{event.errorMessage ?? "—"}</Td>
                    </tr>
                  ))}
                </Tbody>
              </Table>
            }
            cards={
              <div className="divide-y divide-admin-border">
                {webhooks.map((event) => (
                  <div key={event.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-admin-ink">{event.eventType}</p>
                        <p className="mt-1 text-xs text-admin-faint">{event.order ? event.order.orderNumber : "No linked order"}</p>
                      </div>
                      <Badge tone={event.validSignature ? "success" : "danger"}>{event.validSignature ? "Valid" : "Rejected"}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-admin-faint">{event.createdAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</p>
                    {event.errorMessage ? <p className="mt-1 text-xs text-red-600">{event.errorMessage}</p> : null}
                  </div>
                ))}
              </div>
            }
          />
          {!webhooks.length ? <EmptyState title="No webhook events yet" /> : null}
        </Card>
      </div>
    </main>
  );
}
