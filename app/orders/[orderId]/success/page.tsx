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

  if (!order) {
    notFound();
  }

  const item = order.items[0];

  return (
    <main className="min-h-screen bg-[#faf8f6] px-4 py-10 text-black">
      <div className="mx-auto max-w-2xl rounded-[32px] bg-white p-6 shadow-[0_20px_70px_rgba(0,0,0,0.08)] sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-black text-2xl text-white">
          ✓
        </div>

        <div className="mt-5 text-center">
          <p className="text-sm font-medium text-[#a56a2a]">
            Order confirmed
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            Payment Successful
          </h1>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-black/60">
            Thanks for your order. We’ve received your payment and your order is
            now confirmed.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-black/10 bg-[#faf8f6] p-5">
          <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-black/50">
                Order number
              </p>
              <p className="mt-1 font-semibold">{order.orderNumber}</p>
            </div>

            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-black/50">
                Total
              </p>
              <p className="mt-1 text-xl font-semibold text-[#a56a2a]">
                {money(order.totalCents)}
              </p>
            </div>
          </div>

          {item ? (
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-black/50">Product</span>
                <span className="font-medium">{item.product}</span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-black/50">Fabric</span>
                <span className="font-medium">{item.fabric}</span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-black/50">Colour</span>
                <span className="font-medium">{item.color}</span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-black/50">Quantity</span>
                <span className="font-medium">{item.quantity}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded-2xl border border-[#a56a2a]/20 bg-[#fff8f1] p-5">
          <p className="text-sm font-semibold text-black">
            Estimated lead time
          </p>

          <p className="mt-2 text-sm leading-6 text-black/60">
            Estimated production time is 3–5 business days. Because every order
            is custom made, we’ll be in touch to confirm the exact production
            timeline and walk you through any next steps.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
            <Link
                  href={`/studio/projects/${order.buildId}/builder`}
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-black px-6 text-sm font-semibold text-black hover:bg-black hover:text-white">
                     Back to Builder
            </Link>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-black/50">
          Questions? Contact us at hello@toogoodformerch.com
        </p>
      </div>
    </main>
  );
}