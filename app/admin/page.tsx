import Link from "next/link";
import { PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import RevenueChart from "src/components/admin/RevenueChart";

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
  const [recentOrders, totalOrders, paidOrders, pendingOrders, failedOrders, revenue, paidForChart] = await Promise.all([
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 7, include: { items: true } }),
    prisma.order.count(),
    prisma.order.count({ where: { paymentStatus: PaymentStatus.PAID } }),
    prisma.order.count({ where: { paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] } } }),
    prisma.order.count({ where: { paymentStatus: PaymentStatus.FAILED } }),
    prisma.order.aggregate({ where: { paymentStatus: PaymentStatus.PAID }, _sum: { totalCents: true } }),
    prisma.order.findMany({ where: { paymentStatus: PaymentStatus.PAID, paidAt: { gte: buckets[0].start } }, select: { paidAt: true, createdAt: true, totalCents: true, currency: true } }),
  ]);
  for (const order of paidForChart) {
    const date = order.paidAt ?? order.createdAt;
    const bucket = buckets.find((item) => date >= item.start && date < item.end);
    if (bucket) bucket.value += order.totalCents;
  }
  const currency = recentOrders[0]?.currency ?? process.env.STORE_CURRENCY ?? "USD";
  const cards = [
    ["Total sales", money(revenue._sum.totalCents ?? 0, currency), "Confirmed revenue", "bg-[#111827] text-white"],
    ["Total orders", String(totalOrders), "All time", "bg-white"],
    ["Paid orders", String(paidOrders), "Webhook confirmed", "bg-white"],
    ["Pending", String(pendingOrders), "Awaiting payment", "bg-amber-50"],
    ["Failed", String(failedOrders), "Needs attention", "bg-red-50"],
  ];

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Commerce overview</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Good morning.</h1><p className="mt-2 text-sm text-black/45">Here’s what is happening with your store.</p></div>
          <Link href="/admin/orders" className="inline-flex h-11 items-center justify-center rounded-xl bg-[#111827] px-5 text-sm font-semibold text-white">Manage orders</Link>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(([label, value, hint, style]) => <div key={label} className={`rounded-2xl border border-black/5 p-5 shadow-sm ${style}`}><p className="text-sm opacity-55">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-3 text-xs opacity-40">{hint}</p></div>)}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_.8fr]">
          <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-lg font-semibold">Revenue</h2><p className="mt-1 text-xs text-black/40">Paid orders only</p></div><div className="flex rounded-xl bg-black/5 p-1">{(["daily", "weekly", "monthly"] as const).map((value) => <Link key={value} href={`/admin?range=${value}`} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${range === value ? "bg-white shadow-sm" : "text-black/45"}`}>{value}</Link>)}</div></div>
            <div className="mt-6"><RevenueChart data={buckets.map(({ label, value }) => ({ label, value }))} currency={currency} /></div>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Recent orders</h2><Link href="/admin/orders" className="text-xs font-semibold text-black/45">View all →</Link></div>
            <div className="mt-4 divide-y divide-black/5">{recentOrders.map((order) => <Link key={order.id} href={`/admin/orders/${order.id}`} className="flex items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{order.orderNumber}</p><p className="mt-1 text-xs text-black/35">{order.customerName ?? "Customer"} · {order.items.length} item{order.items.length === 1 ? "" : "s"}</p></div><div className="text-right"><p className="text-sm font-semibold">{money(order.totalCents, order.currency)}</p><p className="mt-1 text-[10px] font-semibold text-black/35">{order.paymentStatus}</p></div></Link>)}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
