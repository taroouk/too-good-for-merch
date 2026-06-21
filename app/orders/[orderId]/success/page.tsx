import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "src/lib/prisma";

type SuccessPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

function money(cents: number): string {
  return `${(cents / 100).toFixed(2)} EGP`;
}

export default async function OrderSuccessPage({ params }: SuccessPageProps) {
  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
    },
  });

  if (!order) notFound();

  const item = order.items[0];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#faf8f6] to-[#f3f1ee] px-4 py-12 text-black">
      
      {/* CENTER CARD */}
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-[0_25px_80px_rgba(0,0,0,0.10)]">

        {/* ICON */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-black text-white text-2xl shadow-lg">
          ✓
        </div>

        {/* HEADER */}
        <div className="mt-6 text-center">
          <p className="text-sm font-medium text-amber-700 tracking-wide">
            Order Confirmed
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            Payment Successful
          </h1>

          <p className="mx-auto mt-3 max-w-md text-sm text-black/60 leading-6">
            Your order has been received and is now being processed.
            We’ll start production shortly.
          </p>
        </div>

        {/* ORDER CARD */}
        <div className="mt-8 rounded-2xl border border-black/10 bg-[#faf8f6] p-6 space-y-5">

          {/* TOP INFO */}
          <div className="flex items-center justify-between border-b border-black/10 pb-4">
            
            <div>
              <p className="text-xs uppercase tracking-wide text-black/50">
                Order Number
              </p>
              <p className="mt-1 font-semibold text-lg">
                {order.orderNumber}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-black/50">
                Total
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-700">
                {money(order.totalCents)}
              </p>
            </div>

          </div>

          {/* ITEMS */}
          {item && (
            <div className="grid gap-3 text-sm">

              <div className="flex justify-between">
                <span className="text-black/50">Product</span>
                <span className="font-medium">{item.product}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-black/50">Fabric</span>
                <span className="font-medium">{item.fabric}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-black/50">Color</span>
                <span className="font-medium">{item.color}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-black/50">Quantity</span>
                <span className="font-medium">{item.quantity}</span>
              </div>

            </div>
          )}
        </div>

        {/* LEAD TIME */}
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm font-semibold">
            Estimated Production Time
          </p>

          <p className="mt-2 text-sm text-black/60 leading-6">
            Your order will be produced within <b>3–5 business days</b>.
            Since each item is custom-made, we may contact you for confirmation
            before production starts.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-8 flex justify-center">
          <Link
            href={`/studio/projects/${order.buildId}/builder`}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-black px-6 text-sm font-semibold text-white hover:bg-gray-900 transition"
          >
            Back to Builder
          </Link>
        </div>

        {/* FOOTER */}
        <p className="mt-6 text-center text-xs text-black/40">
          Need help? Contact support@toogoodformerch.com
        </p>

      </div>
    </main>
  );
}