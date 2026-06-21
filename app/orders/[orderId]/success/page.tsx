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
    <main className="min-h-screen bg-[#0b0b0f] flex items-center justify-center px-4 relative overflow-hidden">

      {/* animated glow */}
      <div className="absolute w-[500px] h-[500px] bg-green-500/20 blur-[120px] rounded-full animate-pulse" />

      <div className="w-full max-w-xl">

        {/* CARD */}
        <div className="bg-white/95 backdrop-blur-xl rounded-[28px] shadow-2xl p-8">

          {/* SUCCESS DOT */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white text-2xl">
              ✓
            </div>
          </div>

          {/* TITLE */}
          <h1 className="text-center text-3xl font-bold mt-5">
            Payment successful
          </h1>

          <p className="text-center text-black/60 mt-2">
            Your order is confirmed and is being prepared.
          </p>

          {/* STRIPE-LIKE SUMMARY */}
          <div className="mt-6 rounded-xl bg-gray-50 p-4 space-y-3 text-sm">

            <Row label="Order" value={order.orderNumber} />
            <Row label="Total" value={money(order.totalCents)} highlight />

            {item && (
              <>
                <Row label="Product" value={item.product} />
                <Row label="Fabric" value={item.fabric} />
                <Row label="Color" value={item.color} />
                <Row label="Qty" value={item.quantity} />
              </>
            )}
          </div>

          {/* PROGRESS BAR */}
          <div className="mt-6">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full w-[40%] bg-green-500 animate-pulse" />
            </div>
            <p className="text-xs text-center mt-2 text-black/50">
              Production started
            </p>
          </div>

          {/* CTA */}
          <div className="mt-6 grid grid-cols-2 gap-3">

            <Link
              href={`/studio/projects/${order.buildId}/builder`}
              className="h-11 flex items-center justify-center rounded-xl bg-black text-white"
            >
              Back
            </Link>

            <Link
              href="/orders"
              className="h-11 flex items-center justify-center rounded-xl border"
            >
              Track
            </Link>

          </div>

        </div>
      </div>
    </main>
  );
}

function Row({ label, value, highlight }: any) {
  return (
    <div className="flex justify-between">
      <span className="text-black/50">{label}</span>
      <span className={`font-medium ${highlight ? "text-green-600" : ""}`}>
        {value}
      </span>
    </div>
  );
}