import Link from "next/link";
import { prisma } from "src/lib/prisma";
import { notFound } from "next/navigation";

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} EGP`;
}

export default async function Success({ params }: any) {
  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) notFound();

  const item = order.items[0];

  return (
    <main className="min-h-screen bg-[#f6f5f3] relative overflow-hidden">

      {/* background blobs */}
      <div className="absolute top-[-100px] left-[-100px] w-[300px] h-[300px] bg-green-200 blur-3xl opacity-40" />
      <div className="absolute bottom-[-100px] right-[-100px] w-[300px] h-[300px] bg-amber-200 blur-3xl opacity-30" />

      <div className="relative max-w-3xl mx-auto px-6 py-16">

        {/* MAIN CARD */}
        <div className="bg-white rounded-[32px] shadow-[0_30px_120px_rgba(0,0,0,0.12)] p-10">

          {/* STATUS BADGE */}
          <div className="flex justify-center">
            <div className="bg-green-100 text-green-700 px-4 py-2 rounded-full text-xs font-semibold">
              PAYMENT SUCCESSFUL
            </div>
          </div>

          {/* ICON */}
          <div className="mt-6 flex justify-center">
            <div className="w-20 h-20 rounded-full bg-black text-white flex items-center justify-center text-3xl">
              ✓
            </div>
          </div>

          {/* TITLE */}
          <h1 className="text-center text-4xl font-bold mt-6">
            Your Order is Confirmed
          </h1>

          <p className="text-center text-black/60 mt-3">
            We’ve received your payment and started preparing your order.
          </p>

          {/* ORDER STRIP */}
          <div className="mt-10 grid grid-cols-2 gap-6 bg-[#faf8f6] p-6 rounded-2xl">

            <div>
              <p className="text-xs text-black/50">Order ID</p>
              <p className="font-semibold">{order.orderNumber}</p>
            </div>

            <div className="text-right">
              <p className="text-xs text-black/50">Total</p>
              <p className="font-bold text-green-700 text-xl">
                {money(order.totalCents)}
              </p>
            </div>

          </div>

          {/* ITEM CARD */}
          {item && (
            <div className="mt-6 border rounded-2xl p-5 space-y-2 text-sm">
              <p><span className="text-black/50">Product:</span> {item.product}</p>
              <p><span className="text-black/50">Fabric:</span> {item.fabric}</p>
              <p><span className="text-black/50">Color:</span> {item.color}</p>
              <p><span className="text-black/50">Qty:</span> {item.quantity}</p>
            </div>
          )}

          {/* CTA */}
          <div className="mt-10 flex gap-3">
            <Link
              href={`/studio/projects/${order.buildId}/builder`}
              className="flex-1 bg-black text-white h-12 rounded-xl flex items-center justify-center"
            >
              Back to Builder
            </Link>

            <Link
              href="/orders"
              className="flex-1 border h-12 rounded-xl flex items-center justify-center"
            >
              Track Order
            </Link>
          </div>

        </div>
      </div>
    </main>
  );
}