import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";

type OrderPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

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

function getTimelineIndex(status: OrderStatus): number {
  if (status === OrderStatus.NEW) return 0;
  if (status === OrderStatus.PAID) return 1;
  if (status === OrderStatus.IN_PRODUCTION) return 2;
  if (status === OrderStatus.COMPLETED) return 3;

  return 0;
}

function getProgressWidth(activeIndex: number): string {
  if (activeIndex === 0) return "0%";
  if (activeIndex === 1) return "33%";
  if (activeIndex === 2) return "66%";

  return "100%";
}

export default async function OrderPage({ params }: OrderPageProps) {
  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          asset: true,
        },
      },
      build: true,
    },
  });

  if (!order) {
    notFound();
  }

  const item = order.items[0];

  const timeline = [
    "Order created",
    "Payment confirmed",
    "In production",
    "Completed",
  ];

  const activeIndex = getTimelineIndex(order.status);
  const progressWidth = getProgressWidth(activeIndex);

  const canPay =
    order.paymentStatus !== PaymentStatus.PAID &&
    order.status !== OrderStatus.CANCELLED;

  return (
    <main className="min-h-screen bg-[#faf8f6] px-4 py-10 text-black">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm text-black/50">
                Placed on {formatDate(order.createdAt)}
              </p>
              <h1 className="mt-1 text-3xl font-semibold">
                {order.orderNumber}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-black/60">
                Track your order status here. After payment, our team will
                follow up with you to confirm production details, artwork, and
                timeline.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(
                  order.status,
                )}`}
              >
                {statusLabel(order.status)}
              </span>

              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${paymentBadgeClass(
                  order.paymentStatus,
                )}`}
              >
                Payment {order.paymentStatus}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="space-y-6">
            <div className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Tracking</h2>

              <div className="mt-8">
                <div className="relative">
                  <div className="absolute left-[40px] right-[40px] top-5 hidden h-[3px] rounded-full bg-gray-200 sm:block" />

                  <div
                    className="absolute left-[40px] top-5 hidden h-[3px] rounded-full bg-black transition-all sm:block"
                    style={{ width: progressWidth }}
                  />

                  <div className="relative grid gap-7 sm:grid-cols-4">
                    {timeline.map((step, index) => {
                      const active = index <= activeIndex;

                      return (
                        <div
                          key={step}
                          className="flex flex-col items-center text-center"
                        >
                          <div
                            className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold ${
                              active
                                ? "border-black bg-black text-white"
                                : "border-gray-200 bg-gray-100 text-gray-400"
                            }`}
                          >
                            {active ? "✓" : index + 1}
                          </div>

                          <p
                            className={`mt-3 text-sm font-semibold ${
                              active ? "text-black" : "text-black/40"
                            }`}
                          >
                            {step}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Order item</h2>

              {item ? (
                <div className="mt-5 rounded-3xl border border-black/10 p-5">
                  <div className="flex flex-col gap-5 sm:flex-row">
                    <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-3xl bg-[#faf8f6] text-xs text-black/40">
                      {item.asset?.url ? (
                        <img
                          src={item.asset.url}
                          alt={item.asset.fileName}
                          className="h-full w-full rounded-3xl object-contain"
                        />
                      ) : (
                        "No artwork"
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row">
                        <div>
                          <p className="text-lg font-semibold">
                            Custom T-Shirt
                          </p>
                          <p className="mt-1 text-sm text-black/50">
                            {item.product} · {item.fabric} · {item.color}
                          </p>
                        </div>

                        <p className="text-xl font-semibold text-[#a56a2a]">
                          {money(item.totalCents)}
                        </p>
                      </div>

                      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-black/40">
                            Quantity
                          </p>
                          <p className="mt-1 font-semibold">
                            {item.quantity}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-black/40">
                            Unit price
                          </p>
                          <p className="mt-1 font-semibold">
                            {money(item.unitPriceCents)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-black/40">
                            Placement
                          </p>
                          <p className="mt-1 font-semibold">
                            {Array.isArray(item.placements)
                              ? item.placements.join(", ")
                              : "Saved"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-black/50">No item found.</p>
              )}
            </div>

            <div className="rounded-[32px] border border-[#a56a2a]/20 bg-[#fff8f1] p-6">
              <h2 className="text-lg font-semibold">What happens next?</h2>
              <p className="mt-2 text-sm leading-6 text-black/60">
                Once payment is completed, our team will contact you to confirm
                artwork, sizing, production details, and the final timeline
                before production starts.
              </p>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Order summary</h2>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-black/50">Subtotal</span>
                  <span className="font-medium">
                    {money(order.subtotalCents)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-black/50">Shipping</span>
                  <span className="font-medium">TBC</span>
                </div>

                <div className="border-t border-black/10 pt-3">
                  <div className="flex justify-between">
                    <span className="font-semibold">Total</span>
                    <span className="text-xl font-semibold text-[#a56a2a]">
                      {money(order.totalCents)}
                    </span>
                  </div>
                </div>
              </div>

              {canPay ? (
                <Link
                  href={`/orders/${order.id}/checkout`}
                  className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-black px-6 text-sm font-semibold text-white hover:opacity-90"
                >
                  Continue to Payment
                </Link>
              ) : null}

              {order.buildId ? (
                <Link
                  href={`/studio/projects/${order.buildId}/builder`}
                  className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-xl border border-black px-6 text-sm font-semibold text-black hover:bg-black hover:text-white"
                >
                  Back to Builder
                </Link>
              ) : null}
            </div>

            <div className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Need help?</h2>
              <p className="mt-2 text-sm leading-6 text-black/60">
                Questions about your order? Contact us at
                hello@toogoodformerch.com.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}