import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "src/lib/prisma";

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} EGP`;
}

export default async function OrderSuccessPage({ params }: any) {
  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) notFound();

  const item = order.items[0];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b0b0b] via-[#faf8f6] to-[#f3f1ee] px-4 py-14">

      {/* CENTER WRAPPER */}
      <div className="mx-auto max-w-2xl">

        {/* CARD */}
        <div className="relative overflow-hidden rounded-[28px] bg-white shadow-[0_40px_120px_rgba(0,0,0,0.15)] p-8">

          {/* glowing background */}
          <div className="absolute -top-20 -left-20 h-60 w-60 bg-green-200 blur-3xl opacity-40" />

          {/* ICON */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-black text-white text-3xl shadow-lg">
            ✓
          </div>

          {/* TITLE */}
          <div className="mt-6 text-center">
            <p className="text-xs tracking-[0.3em] text-green-700 uppercase">
              Payment Confirmed
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              Your order is ready
            </h1>

            <p className="mt-3 text-sm text-black/60 leading-6 max-w-md mx-auto">
              We received your payment successfully. Your custom product is now
              entering production.
            </p>
          </div>

          {/* ORDER CARD */}
          <div className="mt-8 rounded-2xl border bg-[#faf8f6] p-5 space-y-4">

            <div className="flex justify-between border-b pb-4">
              <div>
                <p className="text-xs text-black/50">Order</p>
                <p className="font-semibold text-lg">{order.orderNumber}</p>
              </div>

              <div className="text-right">
                <p className="text-xs text-black/50">Total</p>
                <p className="text-2xl font-bold text-green-700">
                  {money(order.totalCents)}
                </p>
              </div>
            </div>

            {item && (
              <div className="grid gap-2 text-sm">
                <Row label="Product" value={item.product} />
                <Row label="Fabric" value={item.fabric} />
                <Row label="Color" value={item.color} />
                <Row label="Qty" value={item.quantity} />
              </div>
            )}
          </div>

          {/* STATUS TIMELINE */}
          <div className="mt-6 grid grid-cols-3 text-center text-xs text-black/60">
            <Step title="Paid" active />
            <Step title="Production" />
            <Step title="Shipping" />
          </div>

          {/* CTA */}
          <div className="mt-8 flex gap-3">
            <Link
              href={`/studio/projects/${order.buildId}/builder`}
              className="flex-1 h-12 rounded-xl bg-black text-white flex items-center justify-center font-semibold hover:bg-gray-900"
            >
              Back to Builder
            </Link>

            <Link
              href="/orders"
              className="flex-1 h-12 rounded-xl border flex items-center justify-center font-semibold hover:bg-black hover:text-white"
            >
              Track Order
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-black/40">
            Need help? support@toogoodformerch.com
          </p>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: any) {
  return (
    <div className="flex justify-between">
      <span className="text-black/50">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Step({ title, active }: any) {
  return (
    <div className="space-y-2">
      <div
        className={`mx-auto h-2 w-2 rounded-full ${
          active ? "bg-green-600" : "bg-gray-300"
        }`}
      />
      <p>{title}</p>
    </div>
  );
}