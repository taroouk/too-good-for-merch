import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentStatus } from "@prisma/client";
import { toggleUserBlockedAction } from "src/actions/admin-system-actions";
import AdminToast from "src/components/admin/AdminToast";
import { prisma } from "src/lib/prisma";
import Breadcrumbs from "src/components/admin/ui/Breadcrumbs";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import StatCard from "src/components/admin/ui/StatCard";
import EmptyState from "src/components/admin/ui/EmptyState";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import { bespokeStatusTone, BESPOKE_STATUS_LABELS, paymentStatusTone } from "src/components/admin/ui/status";

export default async function CustomerDetails({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      orders: { orderBy: { createdAt: "desc" }, take: 100, include: { items: { select: { id: true } } } },
      bespokeRequests: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, requestNumber: true, status: true, createdAt: true, quoteUsdCents: true } },
      _count: { select: { orders: true, builds: true, artworks: true, wishlistItems: true, bespokeRequests: true } },
    },
  });
  if (!user) notFound();

  // Canonical USD lifetime spend, aggregated by the database; legacy paid
  // orders with no recorded USD total are counted, never guessed at.
  const [spend, legacyPaid] = await Promise.all([
    prisma.order.aggregate({ where: { userId: id, paymentStatus: PaymentStatus.PAID, canonicalTotalUsdCents: { not: null } }, _sum: { canonicalTotalUsdCents: true } }),
    prisma.order.count({ where: { userId: id, paymentStatus: PaymentStatus.PAID, canonicalTotalUsdCents: null } }),
  ]);
  const spendUsd = (spend._sum.canonicalTotalUsdCents ?? 0) / 100;
  const returnTo = `/admin/users/${user.id}`;

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-5xl">
        <Breadcrumbs items={[{ label: "Customers", href: "/admin/users" }, { label: user.email ?? "Customer" }]} />

        <div className="flex flex-col justify-between gap-4 rounded-2xl bg-admin-ink p-6 text-white sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[.18em] text-white/40">Customer</p>
            <h1 className="mt-2 break-all text-2xl font-semibold">{user.email ?? "No email"}</h1>
            <p className="mt-2 text-sm text-white/50">{user.phone ?? "No phone"} · joined {user.createdAt.toLocaleDateString("en-GB", { dateStyle: "long" })}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={user.blockedAt ? "danger" : "success"}>{user.blockedAt ? "Blocked" : "Active"}</Badge>
              {user.role === "ADMIN" ? <Badge tone="info">Admin</Badge> : null}
            </div>
          </div>
          {user.role !== "ADMIN" ? (
            <form action={toggleUserBlockedAction} className="shrink-0">
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="block" value={user.blockedAt ? "false" : "true"} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <ConfirmSubmitButton
                variant={user.blockedAt ? "secondary" : "danger"}
                confirmMessage={user.blockedAt ? `Unblock ${user.email ?? "this customer"}?` : `Block ${user.email ?? "this customer"}? They won't be able to sign in or check out.`}
              >
                {user.blockedAt ? "Unblock customer" : "Block customer"}
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Lifetime spend (USD)" value={`USD ${spendUsd.toFixed(2)}`} hint={legacyPaid ? `+${legacyPaid} legacy paid order(s) with no USD total` : undefined} tone="dark" />
          <StatCard label="Orders" value={user._count.orders} />
          <StatCard label="Studio projects" value={user._count.builds} hint={`${user._count.artworks} artworks · ${user._count.wishlistItems} wishlist`} />
          <StatCard label="Bespoke requests" value={user._count.bespokeRequests} />
        </section>

        <Card className="mt-6" padded={false} title={`Orders (${user._count.orders})`} subtitle={user._count.orders > user.orders.length ? `Showing the latest ${user.orders.length}` : undefined}>
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

        <Card className="mt-6" padded={false} title={`Bespoke requests (${user._count.bespokeRequests})`}>
          {user.bespokeRequests.length > 0 ? (
            <div className="divide-y divide-admin-border">
              {user.bespokeRequests.map((request) => (
                <Link href={`/admin/bespoke/${request.id}`} key={request.id} className="flex flex-col justify-between gap-3 px-5 py-4 hover:bg-black/[.02] sm:flex-row sm:items-center">
                  <div>
                    <p className="font-semibold text-admin-ink">{request.requestNumber}</p>
                    <p className="mt-1 text-xs text-admin-faint">{request.createdAt.toLocaleDateString("en-GB")}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge tone={bespokeStatusTone(request.status)}>{BESPOKE_STATUS_LABELS[request.status]}</Badge>
                    {request.quoteUsdCents != null ? <span className="font-semibold text-admin-ink">USD {(request.quoteUsdCents / 100).toFixed(2)}</span> : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No bespoke requests" />
          )}
        </Card>
      </div>
    </main>
  );
}
