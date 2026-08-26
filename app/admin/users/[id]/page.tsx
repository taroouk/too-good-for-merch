import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "src/lib/prisma";
import Breadcrumbs from "src/components/admin/ui/Breadcrumbs";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import EmptyState from "src/components/admin/ui/EmptyState";
import { paymentStatusTone } from "src/components/admin/ui/status";

export default async function CustomerDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, include: { orders: { orderBy: { createdAt: "desc" }, include: { items: true } } } });
  if (!user) notFound();

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-5xl">
        <Breadcrumbs items={[{ label: "Customers", href: "/admin/users" }, { label: user.email ?? "Customer" }]} />

        <div className="rounded-2xl bg-admin-ink p-6 text-white">
          <p className="text-xs uppercase tracking-[.18em] text-white/40">Customer</p>
          <h1 className="mt-2 text-2xl font-semibold">{user.email ?? "No email"}</h1>
          <p className="mt-2 text-sm text-white/50">{user.phone ?? "No phone"} · joined {user.createdAt.toLocaleDateString("en-GB", { dateStyle: "long" })}</p>
          {user.blockedAt ? (
            <div className="mt-3"><Badge tone="danger">Blocked</Badge></div>
          ) : null}
        </div>

        <Card className="mt-6" padded={false} title={`Orders (${user.orders.length})`}>
          {user.orders.length > 0 ? (
            <div className="divide-y divide-admin-border">
              {user.orders.map((order) => (
                <Link href={`/admin/orders/${order.id}`} key={order.id} className="flex flex-col justify-between gap-3 px-5 py-4 hover:bg-black/[.02] sm:flex-row sm:items-center">
                  <div>
                    <p className="font-semibold text-admin-ink">{order.orderNumber}</p>
                    <p className="mt-1 text-xs text-admin-faint">{order.createdAt.toLocaleDateString("en-GB")} · {order.items.length} items</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge tone={paymentStatusTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
                    <span className="font-semibold text-admin-ink">{order.currency} {(order.totalCents / 100).toFixed(2)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No orders" />
          )}
        </Card>
      </div>
    </main>
  );
}
