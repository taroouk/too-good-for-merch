import Link from "next/link";
import { BespokeRequestStatus, OrderStatus, PaymentStatus, Role } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import RevenueChart from "src/components/admin/RevenueChart";
import PageHeader from "src/components/admin/ui/PageHeader";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import { buttonClass } from "src/components/admin/ui/Button";
import EmptyState from "src/components/admin/ui/EmptyState";
import { AlertIcon } from "src/components/admin/ui/icons";
import { ORDER_STATUS_LABELS, orderStatusTone, paymentStatusTone } from "src/components/admin/ui/status";
import PricesCurrencyPanel from "src/components/admin/PricesCurrencyPanel";
import AdminToast from "src/components/admin/AdminToast";
import { ActionTile, HealthDot, KpiCard } from "src/components/admin/OverviewParts";
import { addToBuckets, averageOrderValueCents, compareDelta, conversionRate, parsePeriod, periodBuckets, periodRange, PERIODS } from "src/lib/admin/overview";
import { requireAdmin } from "src/lib/admin/auth";
import { getPricingHealth } from "src/lib/admin/pricing-health";
import { getPaymobHealth } from "src/lib/admin/paymob-health";
import { getSystemHealth } from "src/lib/admin/system-health";

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

const OPEN_ORDER_STATUSES: OrderStatus[] = [OrderStatus.NEW, OrderStatus.PAID, OrderStatus.IN_PRODUCTION];
const KEY_CHECKS = ["db", "migrations", "paymob-config", "fx"];

function titleCase(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; notice?: string }> }) {
  const query = await searchParams;
  const admin = await requireAdmin();
  const now = new Date();
  const period = parsePeriod(query.period);
  const range = periodRange(period, now);
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "7 days";
  const buckets = periodBuckets(period, now);

  const inRange = { gte: range.start, lt: range.end };
  const inPrev = { gte: range.prevStart, lt: range.prevEnd };
  const paidSince = (when: { gte: Date; lt: Date }) => ({ paymentStatus: PaymentStatus.PAID, paidAt: when });
  const revenueAggregate = (when: { gte: Date; lt: Date }) =>
    prisma.order.aggregate({ where: paidSince(when), _sum: { canonicalTotalUsdCents: true }, _count: { _all: true, canonicalTotalUsdCents: true } });

  const [
    recentOrders,
    recentPayments,
    revenueNow,
    revenuePrev,
    revenueAll,
    createdNow,
    createdPrev,
    paidFromCreatedNow,
    paidFromCreatedPrev,
    newCustomersNow,
    newCustomersPrev,
    totalCustomers,
    toFulfil,
    pendingOrders,
    failedOrders,
    openBespoke,
    paidForChart,
    orderStatusCounts,
    topProducts,
    pricingHealth,
    systemHealth,
  ] = await Promise.all([
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { items: true } }),
    prisma.paymentAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { order: { select: { id: true, orderNumber: true } } } }),
    // Canonical revenue is USD-only: Order.totalCents is the PAYMENT amount
    // (EGP) so it can't be summed under one currency label. Aggregated by the
    // database, O(1) however many orders exist. Orders from before the
    // canonical USD total existed carry no figure and are left out of money
    // sums (counted separately below).
    revenueAggregate(inRange),
    revenueAggregate(inPrev),
    revenueAggregate({ gte: new Date(0), lt: new Date(now.getTime() + 1) }),
    prisma.order.count({ where: { createdAt: inRange } }),
    prisma.order.count({ where: { createdAt: inPrev } }),
    prisma.order.count({ where: { createdAt: inRange, paymentStatus: PaymentStatus.PAID } }),
    prisma.order.count({ where: { createdAt: inPrev, paymentStatus: PaymentStatus.PAID } }),
    prisma.user.count({ where: { role: Role.USER, createdAt: inRange } }),
    prisma.user.count({ where: { role: Role.USER, createdAt: inPrev } }),
    prisma.user.count({ where: { role: Role.USER } }),
    prisma.order.count({ where: { paymentStatus: PaymentStatus.PAID, status: { in: OPEN_ORDER_STATUSES }, shippedAt: null } }),
    prisma.order.count({ where: { paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] }, status: { not: OrderStatus.CANCELLED } } }),
    prisma.order.count({ where: { paymentStatus: PaymentStatus.FAILED } }),
    prisma.bespokeRequest.count({ where: { status: { in: [BespokeRequestStatus.NEW, BespokeRequestStatus.CONTACTED] } } }),
    prisma.order.findMany({ where: paidSince(inRange), select: { paidAt: true, createdAt: true, canonicalTotalUsdCents: true } }),
    prisma.order.groupBy({ by: ["status"], _count: true }),
    prisma.orderItem.groupBy({
      by: ["product", "fabric"],
      where: { order: paidSince(inRange) },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    getPricingHealth(),
    getSystemHealth(),
  ]);
  const paymobHealth = getPaymobHealth();

  for (const order of paidForChart) {
    if (order.canonicalTotalUsdCents == null) continue;
    addToBuckets(buckets, order.paidAt ?? order.createdAt, order.canonicalTotalUsdCents);
  }

  const revNow = revenueNow._sum.canonicalTotalUsdCents ?? 0;
  const revPrev = revenuePrev._sum.canonicalTotalUsdCents ?? 0;
  const paidNow = revenueNow._count._all;
  const paidPrev = revenuePrev._count._all;
  const aovNow = averageOrderValueCents(revNow, revenueNow._count.canonicalTotalUsdCents ?? 0);
  const aovPrev = averageOrderValueCents(revPrev, revenuePrev._count.canonicalTotalUsdCents ?? 0);
  const convNow = conversionRate(paidFromCreatedNow, createdNow);
  const convPrev = conversionRate(paidFromCreatedPrev, createdPrev);
  const legacyPaid = revenueAll._count._all - (revenueAll._count.canonicalTotalUsdCents ?? 0);

  const countByOrderStatus = new Map(orderStatusCounts.map((row) => [row.status, row._count]));
  const totalOrderStatusCount = orderStatusCounts.reduce((sum, row) => sum + row._count, 0);
  const topMax = Math.max(...topProducts.map((row) => row._sum.quantity ?? 0), 1);

  const alerts: Array<{ message: string; href: string; cta: string }> = [];
  if (pricingHealth.usdToEgpRate == null) alerts.push({ message: "USD → EGP exchange rate is not configured — checkout will fail.", href: "/admin/settings", cta: "Set rate" });
  if (!paymobHealth.allConfigured) alerts.push({ message: `${paymobHealth.missingRequired.length} required Paymob credential(s) missing.`, href: "/admin/settings", cta: "Review" });
  if (pricingHealth.missingCombos.length > 0) alerts.push({ message: `${pricingHealth.missingCombos.length} product/fabric combination(s) have no price configured.`, href: "/admin/pricing", cta: "Set prices" });
  const covered = new Set(["env", "paymob-config", "fx", "pricing"]);
  for (const check of systemHealth.checks) {
    if (check.level === "ok" || covered.has(check.id)) continue;
    alerts.push({ message: check.detail, href: check.href ?? "/admin/system", cta: "Review" });
  }
  const keyChecks = KEY_CHECKS.map((id) => systemHealth.checks.find((check) => check.id === id)).filter((check): check is NonNullable<typeof check> => Boolean(check));
  const healthy = systemHealth.checks.every((check) => check.level === "ok");
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const adminName = admin.email?.split("@")[0] ?? "there";

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow={today}
          title={`Welcome back, ${adminName}`}
          subtitle="Everything that needs you, and how the store is doing."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin/pricing" className={buttonClass({ variant: "outline" })}>Pricing</Link>
              <Link href="/admin/orders" className={buttonClass()}>Manage orders</Link>
            </div>
          }
        />

        {/* 1. What needs attention right now */}
        {alerts.length > 0 ? (
          <section aria-label="Needs attention" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertIcon className="h-5 w-5 shrink-0 text-amber-700" />
              {alerts.length} thing{alerts.length === 1 ? "" : "s"} need{alerts.length === 1 ? "s" : ""} your attention
            </div>
            <ul className="mt-3 space-y-2">
              {alerts.slice(0, 4).map((alert) => (
                <li key={alert.message} className="flex items-center justify-between gap-4 rounded-xl bg-white/70 px-4 py-2.5">
                  <p className="min-w-0 text-sm text-amber-950">{alert.message}</p>
                  <Link href={alert.href} className="shrink-0 text-xs font-semibold text-amber-900 underline">{alert.cta}</Link>
                </li>
              ))}
            </ul>
            {alerts.length > 4 ? <Link href="/admin/system" className="mt-3 inline-block text-xs font-semibold text-amber-900 underline">+{alerts.length - 4} more in System health</Link> : null}
          </section>
        ) : null}

        <section aria-label="To do" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ActionTile label="To fulfil" count={toFulfil} href="/admin/orders?status=paid" hint="Paid, not shipped yet" tone="info" />
          <ActionTile label="Awaiting payment" count={pendingOrders} href="/admin/orders?status=pending" hint="Customers who haven't paid" tone="warning" />
          <ActionTile label="Failed payments" count={failedOrders} href="/admin/payments" hint="May need a retry link" tone="danger" />
          <ActionTile label="Bespoke requests" count={openBespoke} href="/admin/bespoke" hint="New or in conversation" tone="info" />
        </section>

        {/* 2. How the store is doing, with a period switch */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-admin-ink">Performance</h2>
            <p className="text-xs text-admin-faint">Last {periodLabel} vs the {periodLabel} before.</p>
          </div>
          <div className="flex rounded-xl bg-black/5 p-1" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/admin?period=${p.key}`}
                aria-current={period === p.key ? "page" : undefined}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${period === p.key ? "bg-white text-admin-ink shadow-sm" : "text-admin-faint hover:text-admin-ink"}`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        <section className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          <div className="col-span-2 xl:col-span-1">
            <KpiCard
              dark
              label="Revenue"
              value={money(revNow, "USD")}
              delta={compareDelta(revNow, revPrev)}
              hint={`All time ${money(revenueAll._sum.canonicalTotalUsdCents ?? 0, "USD")}${legacyPaid > 0 ? ` · ${legacyPaid} older paid order(s) have no USD total` : ""}`}
            />
          </div>
          <KpiCard label="Paid orders" value={paidNow} delta={compareDelta(paidNow, paidPrev)} hint={`${createdNow} placed in the period`} />
          <KpiCard label="Avg. order value" value={aovNow != null ? money(aovNow, "USD") : "—"} delta={compareDelta(aovNow ?? 0, aovPrev ?? 0)} hint="Per paid order, USD" />
          <KpiCard label="Checkout conversion" value={convNow != null ? `${convNow}%` : "—"} delta={compareDelta(convNow ?? 0, convPrev ?? 0)} hint="Orders placed that got paid" />
          <KpiCard label="New customers" value={newCustomersNow} delta={compareDelta(newCustomersNow, newCustomersPrev)} hint={`${totalCustomers} customer${totalCustomers === 1 ? "" : "s"} in total`} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card title="Revenue" subtitle={`Paid orders, canonical USD · last ${periodLabel}`}>
            <RevenueChart data={buckets.map(({ label, value }) => ({ label, value }))} currency="USD" />
          </Card>

          <Card title="Order pipeline" subtitle="Every order, by fulfilment stage">
            <div className="space-y-3">
              {Object.values(OrderStatus).map((status) => {
                const count = countByOrderStatus.get(status) ?? 0;
                const pct = totalOrderStatusCount ? Math.round((count / totalOrderStatusCount) * 100) : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className="w-28 shrink-0"><Badge tone={orderStatusTone(status)}>{ORDER_STATUS_LABELS[status]}</Badge></div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                      <div className="h-full rounded-full bg-admin-ink" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-admin-ink">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        {/* 3. Activity */}
        <section className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Card title="Recent orders" actions={<Link href="/admin/orders" className="text-xs font-semibold text-admin-faint hover:text-admin-ink">View all →</Link>}>
            {recentOrders.length > 0 ? (
              <div className="divide-y divide-admin-border">
                {recentOrders.map((order) => (
                  <Link key={order.id} href={`/admin/orders/${order.id}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-admin-ink">{order.orderNumber}</p>
                      <p className="mt-0.5 truncate text-xs text-admin-faint">{order.customerName ?? "Customer"} · {order.items.length} item{order.items.length === 1 ? "" : "s"} · {order.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-admin-ink">{money(order.totalCents, order.currency)}</p>
                      <div className="mt-1"><Badge tone={paymentStatusTone(order.paymentStatus)}>{order.paymentStatus}</Badge></div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No orders yet" description="Orders will show up here as customers check out." />
            )}
          </Card>

          <Card title="Top sellers" subtitle={`Units sold, last ${periodLabel}`} actions={<Link href="/admin/products" className="text-xs font-semibold text-admin-faint hover:text-admin-ink">Products →</Link>}>
            {topProducts.length > 0 ? (
              <ol className="space-y-4">
                {topProducts.map((row, index) => {
                  const units = row._sum.quantity ?? 0;
                  return (
                    <li key={`${row.product}-${row.fabric}`}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-semibold text-admin-ink"><span className="mr-2 text-admin-faint">{index + 1}</span>{titleCase(row.product)} · {titleCase(row.fabric)}</span>
                        <span className="shrink-0 tabular-nums text-admin-muted">{units} unit{units === 1 ? "" : "s"}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-admin-ink" style={{ width: `${Math.round((units / topMax) * 100)}%` }} /></div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState title="No sales in this period" description="Top products appear once orders are paid." />
            )}
          </Card>

          <Card title="Recent payments" className="lg:col-span-2 xl:col-span-1" actions={<Link href="/admin/payments" className="text-xs font-semibold text-admin-faint hover:text-admin-ink">View all →</Link>}>
            {recentPayments.length > 0 ? (
              <div className="divide-y divide-admin-border">
                {recentPayments.map((attempt) => (
                  <Link key={attempt.id} href={`/admin/orders/${attempt.order.id}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-admin-ink">{attempt.order.orderNumber}</p>
                      <p className="mt-0.5 text-xs text-admin-faint">{attempt.method} · {attempt.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-admin-ink">{money(attempt.amountCents, attempt.currency)}</p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-admin-faint">{attempt.status}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No payment activity yet" />
            )}
          </Card>
        </section>

        {/* 4. Store health */}
        <section className="mt-6">
          <Card
            title="Store health"
            subtitle={healthy ? "Everything is running normally." : "Some checks need a look."}
            actions={<Link href="/admin/system" className="text-xs font-semibold text-admin-faint hover:text-admin-ink">System health →</Link>}
          >
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {keyChecks.map((check) => (
                <li key={check.id} className="flex items-start gap-3 rounded-xl bg-admin-canvas p-3.5">
                  <span className="mt-1.5"><HealthDot level={check.level} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-admin-ink">{check.label}</p>
                    <p className="mt-0.5 break-words text-xs leading-5 text-admin-faint">{check.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* 5. Prices & currency (editable) */}
        <PricesCurrencyPanel />
      </div>
    </main>
  );
}
