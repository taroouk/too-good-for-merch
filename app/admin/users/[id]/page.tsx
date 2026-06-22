import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "src/lib/prisma";

export default async function CustomerDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, include: { orders: { orderBy: { createdAt: "desc" }, include: { items: true } } } });
  if (!user) notFound();
  return <main className="p-4 sm:p-7 xl:p-9"><div className="mx-auto max-w-5xl"><Link href="/admin/users" className="text-sm font-semibold text-black/45">← Customers</Link><section className="mt-5 rounded-2xl bg-[#111827] p-6 text-white"><p className="text-xs uppercase tracking-[.18em] text-white/40">Customer</p><h1 className="mt-2 text-2xl font-semibold">{user.email ?? "No email"}</h1><p className="mt-2 text-sm text-white/50">{user.phone ?? "No phone"} · joined {user.createdAt.toLocaleDateString("en-GB", { dateStyle: "long" })}</p></section><section className="mt-6 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm"><div className="border-b border-black/5 px-5 py-4"><h2 className="font-semibold">Orders ({user.orders.length})</h2></div><div className="divide-y divide-black/5">{user.orders.map((order) => <Link href={`/admin/orders/${order.id}`} key={order.id} className="flex flex-col justify-between gap-3 px-5 py-4 hover:bg-black/[.02] sm:flex-row sm:items-center"><div><strong>{order.orderNumber}</strong><p className="mt-1 text-xs text-black/40">{order.createdAt.toLocaleDateString("en-GB")} · {order.items.length} items</p></div><div className="flex gap-4"><span className="text-xs font-semibold text-black/45">{order.paymentStatus}</span><strong>{order.currency} {(order.totalCents / 100).toFixed(2)}</strong></div></Link>)}{!user.orders.length ? <p className="p-10 text-center text-sm text-black/40">No orders.</p> : null}</div></section></div></main>;
}
