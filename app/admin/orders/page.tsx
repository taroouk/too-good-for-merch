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
  if (status === OrderStatus.PAID) {
    return "bg-green-100 text-green-700 border-green-200";
  }

  if (status === OrderStatus.IN_PRODUCTION) {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }

  if (status === OrderStatus.COMPLETED) {
    return "bg-black text-white border-black";
  }

  if (status === OrderStatus.CANCELLED) {
    return "bg-red-100 text-red-700 border-red-200";
  }

  return "bg-[#fff8f1] text-[#a56a2a] border-[#a56a2a]/20";
}

function paymentBadgeClass(status: PaymentStatus): string {
  if (status === PaymentStatus.PAID) {
    return "bg-green-100 text-green-700 border-green-200";
  }

  if (status === PaymentStatus.PENDING) {
    return "bg-yellow-100 text-yellow-700 border-yellow-200";
  }

  if (status === PaymentStatus.FAILED) {
    return "bg-red-100 text-red-700 border-red-200";
  }

  return "bg-gray-100 text-gray-700 border-gray-200";
}

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      items: true,
      notes: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  const totalRevenueCents = orders.reduce((sum, order) => {
    if (order.paymentStatus !== PaymentStatus.PAID) {
      return sum;
    }

    return sum + order.totalCents;
  }, 0);

  return (
    <main className="px-4 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
          <p className="text-sm font-medium text-[#a56a2a]">
            Admin Dashboard
          </p>

          <div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold">Orders</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-black/60">
                Manage customer orders, payment status, production workflow,
                artwork, and internal admin notes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-2xl border border-black/10 p-4">
                <p className="text-black/50">Orders</p>
                <p className="mt-1 text-xl font-semibold">{orders.length}</p>
              </div>

              <div className="rounded-2xl border border-black/10 p-4">
                <p className="text-black/50">Paid revenue</p>
                <p className="mt-1 text-xl font-semibold">
                  {money(totalRevenueCents)}
                </p>
              </div>

              <div className="rounded-2xl border border-black/10 p-4">
                <p className="text-black/50">Currency</p>
                <p className="mt-1 text-xl font-semibold">USD</p>
              </div>
            </div>
          </div>
        </div>

        <section className="overflow-hidden rounded-[32px] bg-white shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
          <div className="border-b border-black/10 px-6 py-5">
            <h2 className="text-lg font-semibold">All orders</h2>
          </div>

          {orders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-[#faf8f6] text-xs uppercase tracking-wide text-black/50">
                  <tr>
                    <th className="px-6 py-4">Order</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Items</th>
                    <th className="px-6 py-4">Payment</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Total</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-black/10">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-[#faf8f6]">
                      <td className="px-6 py-5">
                        <p className="font-semibold">{order.orderNumber}</p>
                        <p className="mt-1 text-xs text-black/40">
                          {order.notes.length} admin note
                          {order.notes.length === 1 ? "" : "s"}
                        </p>
                      </td>

                      <td className="px-6 py-5">
                        <p className="font-medium">
                          {order.customerName ?? "No name"}
                        </p>

                        <p className="mt-1 text-xs text-black/50">
                          {order.customerEmail ??
                            order.user?.email ??
                            "No email"}
                        </p>

                        <p className="mt-1 text-xs text-black/50">
                          {order.customerPhone ?? "No phone"}
                        </p>
                      </td>

                      <td className="px-6 py-5 text-black/60">
                        {formatDate(order.createdAt)}
                      </td>

                      <td className="px-6 py-5">{order.items.length}</td>

                      <td className="px-6 py-5">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${paymentBadgeClass(
                            order.paymentStatus,
                          )}`}
                        >
                          {order.paymentStatus}
                        </span>
                      </td>

                      <td className="px-6 py-5">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(
                            order.status,
                          )}`}
                        >
                          {statusLabel(order.status)}
                        </span>
                      </td>

                      <td className="px-6 py-5 text-right font-semibold text-[#a56a2a]">
                        {money(order.totalCents)}
                      </td>

                      <td className="px-6 py-5 text-right">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-black px-4 text-xs font-semibold text-white hover:opacity-90"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-black/50">No orders found yet.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}