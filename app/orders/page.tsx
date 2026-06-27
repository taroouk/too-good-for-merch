import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/orders");

  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">Account</p>
            <h1 className="mt-2 text-4xl font-semibold">Your orders</h1>
          </div>
          <Link href="/studio" className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
            Open studio
          </Link>
        </div>
        <div className="mt-8 space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex flex-col justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm transition hover:-translate-y-0.5 sm:flex-row sm:items-center"
            >
              <div>
                <strong>{order.orderNumber}</strong>
                <p className="mt-1 text-sm text-black/45">{order.createdAt.toLocaleDateString("en-GB")}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold">{order.paymentStatus}</span>
                <strong>
                  {order.currency} {(order.totalCents / 100).toFixed(2)}
                </strong>
              </div>
            </Link>
          ))}
          {!orders.length ? <div className="rounded-2xl bg-white p-10 text-center text-black/50">No orders yet.</div> : null}
        </div>
      </div>
    </main>
  );
}
