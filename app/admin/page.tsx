import Link from "next/link";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import RevenueChart from "src/components/admin/RevenueChart";
import PageHeader from "src/components/admin/ui/PageHeader";
import StatCard from "src/components/admin/ui/StatCard";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import { buttonClass } from "src/components/admin/ui/Button";
import EmptyState from "src/components/admin/ui/EmptyState";
import { AlertIcon } from "src/components/admin/ui/icons";
import { ORDER_STATUS_LABELS, orderStatusTone, paymentStatusTone } from "src/components/admin/ui/status";
import { getPricingHealth } from "src/lib/admin/pricing-health";
import { getPaymobHealth } from "src/lib/admin/paymob-health";

type Range = "daily" | "weekly" | "monthly";

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

function chartBuckets(range: Range) {
  const now = new Date();
  const count = range === "daily" ? 14 : 12;
  return Array.from({ length: count }, (_, reverseIndex) => {
    const index = count - reverseIndex - 1;
    const start = new Date(now);
    if (range === "daily") start.setUTCDate(start.getUTCDate() - index);
    if (range === "weekly") start.setUTCDate(start.getUTCDate() - index * 7);
    if (range === "monthly") start.setUTCMonth(start.getUTCMonth() - index, 1);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    if (range === "daily") end.setUTCDate(end.getUTCDate() + 1);
    if (range === "weekly") end.setUTCDate(end.getUTCDate() + 7);
    if (range === "monthly") end.setUTCMonth(end.getUTCMonth() + 1);
    const label = range === "monthly"
      ? start.toLocaleDateString("en", { month: "short", timeZone: "UTC" })
      : start.toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });
    return { start, end, label, value: 0 };
  });
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const query = await searchParams;
  const range: Range = ["daily", "weekly", "monthly"].includes(query.range ?? "") ? query.range as Range : "daily";
  const buckets = chartBuckets(range);
  const [
    recentOrders,
    recentPayments,
    totalOrders,
    paidOrders,
    pendingOrders,
    failedOrders,
    revenue,
    paidForChart,
    orderStatusCounts,
    pricingHealth,
  ] = await Promise.all([
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 7, include: { items: true } }),
    prisma.paymentAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { order: { select: { id: true, orderNumber: true, customerName: true } } } }),
    prisma.order.count(),
    prisma.order.count({ where: { paymentStatus: PaymentStatus.PAID } }),
    prisma.order.count({ where: { paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] } } }),
    prisma.order.count({ where: { paymentStatus: PaymentStatus.FAILED } }),
    // Canonical revenue must be USD-only (P1-14): totalCents is the
    // PAYMENT amount/currency (EGP), not what the store sold in USD, so
    // this can never be summed with a single currency label. See
    // src/lib/admin/currency-aggregates.ts.
    // P2-11: aggregated BY THE DATABASE (not fetched as raw rows), so this
    // stays O(1) instead of O(every paid order ever) as order history
    // grows. _count.canonicalTotalUsdCents only counts non-null values,
    // which is exactly what's needed to derive excludedLegacyCount below.
    prisma.order.aggregate({
      where: { paymentStatus: PaymentStatus.PAID },
      _sum: { canonicalTotalUsdCents: true },
      _count: { canonicalTotalUsdCents: true },
    }),
    prisma.order.findMany({ where: { paymentStatus: PaymentStatus.PAID, paidAt: { gte: buckets[0].start } }, select: { paidAt: true, createdAt: true, canonicalTotalUsdCents: true } }),
    prisma.order.groupBy({ by: ["status"], _count: true }),
    getPricingHealth(),
  ]);
  const paymobHealth = getPaymobHealth();
  // Chart + "Total sales" card are both canonical-USD reporting, so orders
  // predating canonicalTotalUsdCents (see src/lib/orders/display.ts) are
  // excluded rather than guessed at -- surfaced via revenueTotals.excludedLegacyCount.
  for (const order of paidForChart) {
    if (order.canonicalTotalUsdCents == null) continue;
    const date = order.paidAt ?? order.createdAt;
    const bucket = buckets.find((item) => date >= item.start && date < item.end);
    if (bucket) bucket.value += order.canonicalTotalUsdCents;
  }
  const revenueTotals = {
    revenueUsdCents: revenue._sum.canonicalTotalUsdCents ?? 0,
    excludedLegacyCount: paidOrders - (revenue._count.canonicalTotalUsdCents ?? 0),
  };
  const currency = "USD";
  const countByOrderStatus = new Map(orderStatusCounts.map((row) => [row.status, row._count]));
  const totalOrderStatusCount = orderStatusCounts.reduce((sum, row) => sum + row._count, 0);

  const alerts: Array<{ message: string; href: string; cta: string }> = [];
  if (pricingHealth.usdToEgpRate == null) {
    alerts.push({ message: "USD → EGP exchange rate is not configured — checkout will fail.", href: "/admin/settings", cta: "Set rate" });
  }
  if (!paymobHealth.allConfigured) {
    alerts.push({ message: `${paymobHealth.missingRequired.length} required Paymob credential(s) missing.`, href: "/admin/settings", cta: "Review" });
  }
  if (pricingHealth.missingCombos.length > 0) {
    alerts.push({ message: `${pricingHealth.missingCombos.length} product/fabric combination(s) have no price configured.`, href: "/admin/products", cta: "Review" });
  }
  if (failedOrders > 0) {
    alerts.push({ message: `${failedOrders} order(s) have a failed payment and may need a retry link.`, href: "/admin/payments", cta: "Review" });
  }

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Commerce overview"
          title="Good morning."
          subtitle="Here's what is happening with your store."
          actions={
            <Link href="/admin/orders" className={buttonClass()}>
              Manage orders
            </Link>
          }
        />

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Revenue (USD)"
            value={money(revenueTotals.revenueUsdCents, currency)}
            hint={
              revenueTotals.excludedLegacyCount > 0
                ? `Confirmed revenue · ${revenueTotals.excludedLegacyCount} legacy paid order(s) excluded (no recorded USD total)`
                : "Confirmed revenue"
            }
            tone="dark"
          />
          <StatCard label="Total orders" value={totalOrders} hint="All time" />
          <StatCard label="Paid orders" value={paidOrders} hint="Webhook confirmed" tone="success" />
          <StatCard label="Pending" value={pendingOrders} hint="Awaiting payment" tone="warning" />
          <StatCard label="Failed" value={failedOrders} hint="Needs attention" tone="danger" />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_.8fr]">
          <Card
            title="Revenue (USD)"
            subtitle="Paid orders only, canonical USD"
            actions={
              <div className="flex rounded-xl bg-black/5 p-1">
                {(["daily", "weekly", "monthly"] as const).map((value) => (
                  <Link
                    key={value}
                    href={`/admin?range=${value}`}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${range === value ? "bg-white shadow-sm" : "text-admin-faint"}`}
                  >
                    {value}
                  </Link>
                ))}
              </div>
            }
          >
            <RevenueChart data={buckets.map(({ label, value }) => ({ label, value }))} currency={currency} />
          </Card>

          <Card title="Recent orders" actions={<Link href="/admin/orders" className="text-xs font-semibold text-admin-faint hover:text-admin-ink">View all →</Link>}>
            {recentOrders.length > 0 ? (
              <div className="divide-y divide-admin-border">
                {recentOrders.map((order) => (
                  <Link key={order.id} href={`/admin/orders/${order.id}`} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-admin-ink">{order.orderNumber}</p>
                      <p className="mt-1 text-xs text-admin-faint">{order.customerName ?? "Customer"} · {order.items.length} item{order.items.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-admin-ink">{money(order.totalCents, order.currency)}</p>
                      <div className="mt-1"><Badge tone={paymentStatusTone(order.paymentStatus)}>{order.paymentStatus}</Badge></div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No orders yet" description="Orders will show up here as customers check out." />
            )}
          </Card>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Order status overview" subtitle="Fulfillment breakdown across every order">
            <div className="space-y-3">
              {Object.values(OrderStatus).map((status) => {
                const count = countByOrderStatus.get(status) ?? 0;
                const pct = totalOrderStatusCount ? Math.round((count / totalOrderStatusCount) * 100) : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <Badge tone={orderStatusTone(status)}>{ORDER_STATUS_LABELS[status]}</Badge>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                      <div className="h-full rounded-full bg-admin-ink" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold text-admin-ink">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Recent payments" actions={<Link href="/admin/payments" className="text-xs font-semibold text-admin-faint hover:text-admin-ink">View all →</Link>}>
            {recentPayments.length > 0 ? (
              <div className="divide-y divide-admin-border">
                {recentPayments.map((attempt) => (
                  <Link key={attempt.id} href={`/admin/orders/${attempt.order.id}`} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-admin-ink">{attempt.order.orderNumber}</p>
                      <p className="mt-1 text-xs text-admin-faint">{attempt.method} · {attempt.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-admin-ink">{money(attempt.amountCents, attempt.currency)}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-admin-faint">{attempt.status}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No payment activity yet" />
            )}
          </Card>
        </section>

        <section className="mt-6">
          <Card title="Operational alerts" subtitle="Real signals pulled from pricing, payment, and order configuration">
            {alerts.length > 0 ? (
              <ul className="space-y-3">
                {alerts.map((alert) => (
                  <li key={alert.message} className="flex items-center justify-between gap-4 rounded-xl bg-amber-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <AlertIcon className="h-5 w-5 shrink-0 text-amber-700" />
                      <p className="text-sm font-medium text-amber-900">{alert.message}</p>
                    </div>
                    <Link href={alert.href} className="shrink-0 text-xs font-semibold text-amber-800 underline">
                      {alert.cta}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="All clear" description="Pricing, payment configuration, and orders all look healthy." />
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}
