import Link from "next/link";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "src/lib/prisma";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

function badge(status: PaymentStatus) {
  if (status === "PAID") return "bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "bg-red-50 text-red-700";
  if (status === "REFUNDED") return "bg-blue-50 text-blue-700";
  return "bg-amber-50 text-amber-700";
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 120);
  const filter = (query.status ?? "all").toLowerCase();
  const statusWhere: Prisma.EnumPaymentStatusFilter | undefined = filter === "pending"
    ? { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] }
    : ["paid", "failed", "refunded"].includes(filter)
      ? { equals: filter.toUpperCase() as PaymentStatus }
      : undefined;
  const where: Prisma.OrderWhereInput = {
    ...(statusWhere ? { paymentStatus: statusWhere } : {}),
    ...(q ? { OR: [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };
  const orders = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 250, include: { items: true, notes: { select: { id: true } } } });
  const filters = ["all", "pending", "paid", "failed", "refunded"];

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Orders</h1><p className="mt-2 text-sm text-black/45">Search, filter, review, and export customer orders.</p></div><a href={`/api/admin/orders/export?status=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}`} className="inline-flex h-11 items-center justify-center rounded-xl border border-black/10 bg-white px-5 text-sm font-semibold shadow-sm">Export CSV ↓</a></div>

        <section className="mt-7 rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 p-4 sm:p-5">
            <form className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex max-w-xl flex-1 gap-2"><input name="q" defaultValue={q} placeholder="Search order, customer, or phone…" className="h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-[#f8f8f8] px-4 text-sm outline-none focus:border-black"/><input type="hidden" name="status" value={filter}/><button className="h-11 rounded-xl bg-[#111827] px-5 text-sm font-semibold text-white">Search</button></div>
              <div className="flex gap-2 overflow-x-auto">{filters.map((item) => <Link key={item} href={`/admin/orders?status=${item}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold capitalize ${filter === item ? "bg-[#111827] text-white" : "bg-black/5 text-black/50"}`}>{item}</Link>)}</div>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-[#f8f8f8] text-[11px] uppercase tracking-wider text-black/35"><tr><th className="px-5 py-4">Order</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Date</th><th className="px-5 py-4">Payment</th><th className="px-5 py-4">Fulfillment</th><th className="px-5 py-4 text-right">Total</th><th className="px-5 py-4"></th></tr></thead>
              <tbody className="divide-y divide-black/5">{orders.map((order) => <tr key={order.id} className="transition hover:bg-black/[.018]"><td className="px-5 py-4"><p className="font-semibold">{order.orderNumber}</p><p className="mt-1 text-xs text-black/35">{order.items.length} item{order.items.length === 1 ? "" : "s"} · {order.notes.length} note{order.notes.length === 1 ? "" : "s"}</p></td><td className="px-5 py-4"><p className="font-medium">{order.customerName ?? "No name"}</p><p className="mt-1 text-xs text-black/40">{order.customerPhone ?? order.customerEmail ?? "—"}</p></td><td className="px-5 py-4 text-black/55">{order.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${badge(order.paymentStatus)}`}>{order.paymentStatus}</span></td><td className="px-5 py-4 text-xs font-semibold text-black/50">{order.status.replaceAll("_", " ")}</td><td className="px-5 py-4 text-right font-semibold">{money(order.totalCents, order.currency)}</td><td className="px-5 py-4 text-right"><Link href={`/admin/orders/${order.id}`} className="rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold">View →</Link></td></tr>)}</tbody>
            </table>
          </div>
          {!orders.length ? <div className="p-16 text-center text-sm text-black/40">No orders match your filters.</div> : null}
          {orders.length ? <div className="border-t border-black/5 px-5 py-4 text-xs text-black/35">Showing {orders.length} order{orders.length === 1 ? "" : "s"}</div> : null}
        </section>
      </div>
    </main>
  );
}
