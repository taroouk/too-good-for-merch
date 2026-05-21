import Link from "next/link";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusLabel(status: OrderStatus): string {
  return status.replaceAll("_", " ");
}

function statusBadgeClass(status: OrderStatus): string {
  if (status === OrderStatus.PAID) return "bg-green-100 text-green-700";
  if (status === OrderStatus.IN_PRODUCTION) return "bg-blue-100 text-blue-700";
  if (status === OrderStatus.COMPLETED) return "bg-black text-white";
  if (status === OrderStatus.CANCELLED) return "bg-red-100 text-red-700";

  return "bg-[#fff8f1] text-[#a56a2a]";
}

export default async function AdminDashboardPage() {
  const [
    recentOrders,
    totalOrders,
    paidOrders,
    newOrders,
    inProductionOrders,
    completedOrders,
    cancelledOrders,
    paidRevenue,
  ] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        items: true,
      },
    }),

    prisma.order.count(),

    prisma.order.count({
      where: { paymentStatus: PaymentStatus.PAID },
    }),

    prisma.order.count({
      where: { status: OrderStatus.NEW },
    }),

    prisma.order.count({
      where: { status: OrderStatus.IN_PRODUCTION },
    }),

    prisma.order.count({
      where: { status: OrderStatus.COMPLETED },
    }),

    prisma.order.count({
      where: { status: OrderStatus.CANCELLED },
    }),

    prisma.order.aggregate({
      where: {
        paymentStatus: PaymentStatus.PAID,
      },
      _sum: {
        totalCents: true,
      },
    }),
  ]);

  return (
    <main className="px-4 py-10">
      <div className="mx-auto max-w-7xl">
        <section className="mb-8 rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
          <p className="text-sm font-medium text-[#a56a2a]">
            Admin Dashboard
          </p>

          <div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold">Dashboard Overview</h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-black/60">
                Manage orders, payment state, production workflow, artwork, and
                internal admin notes.
              </p>
            </div>

            <Link
              href="/admin/orders"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-black px-6 text-sm font-semibold text-white hover:opacity-90"
            >
              View all orders
            </Link>
          </div>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-black/50">Total orders</p>
            <p className="mt-2 text-3xl font-semibold">{totalOrders}</p>
          </div>

          <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-black/50">Paid orders</p>
            <p className="mt-2 text-3xl font-semibold">{paidOrders}</p>
          </div>

          <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-black/50">Paid revenue</p>
            <p className="mt-2 text-3xl font-semibold">
              {money(paidRevenue._sum.totalCents ?? 0)}
            </p>
          </div>

          <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
            <p className="text-sm text-black/50">Currency</p>
            <p className="mt-2 text-3xl font-semibold">USD</p>
          </div>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[24px] border border-[#a56a2a]/20 bg-[#fff8f1] p-5">
            <p className="text-sm text-black/50">New</p>
            <p className="mt-2 text-3xl font-semibold">{newOrders}</p>
          </div>

          <div className="rounded-[24px] border border-blue-200 bg-blue-50 p-5">
            <p className="text-sm text-black/50">In production</p>
            <p className="mt-2 text-3xl font-semibold">
              {inProductionOrders}
            </p>
          </div>

          <div className="rounded-[24px] border border-black/10 bg-white p-5">
            <p className="text-sm text-black/50">Completed</p>
            <p className="mt-2 text-3xl font-semibold">{completedOrders}</p>
          </div>

          <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
            <p className="text-sm text-black/50">Cancelled</p>
            <p className="mt-2 text-3xl font-semibold">{cancelledOrders}</p>
          </div>
        </section>

        <section className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent orders</h2>

            <Link
              href="/admin/orders"
              className="text-sm font-semibold text-[#a56a2a] hover:underline"
            >
              View all
            </Link>
          </div>

          {recentOrders.length > 0 ? (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-black/10 p-4 hover:bg-[#faf8f6] sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="font-semibold">{order.orderNumber}</p>

                    <p className="mt-1 text-sm text-black/50">
                      {formatDate(order.createdAt)} · {order.items.length} item
                      {order.items.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusBadgeClass(
                        order.status,
                      )}`}
                    >
                      {statusLabel(order.status)}
                    </span>

                    <p className="font-semibold text-[#a56a2a]">
                      {money(order.totalCents)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-black/50">No orders yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}