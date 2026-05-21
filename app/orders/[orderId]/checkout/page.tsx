import { notFound } from "next/navigation";
import { prisma } from "src/lib/prisma";

type CheckoutPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function CheckoutPage({
  params,
}: CheckoutPageProps) {
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
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-[#a56a2a]">
            Final step before payment
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            Confirm your contact details
          </h1>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-black/60">
            Add your phone number so our team can follow up with you after
            payment to confirm production details, artwork requirements, and
            timeline.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
            <h2 className="text-lg font-semibold">Customer details</h2>

            <form
              action="/api/payments/paymob/create"
              method="POST"
              className="mt-6 space-y-5"
            >
              <input type="hidden" name="orderId" value={order.id} />

              <div>
                <label className="text-sm font-medium text-black">
                  Full name
                </label>

                <input
                  name="customerName"
                  type="text"
                  defaultValue={order.customerName ?? ""}
                  placeholder="Your full name"
                  className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-black">
                  Phone number <span className="text-[#a56a2a]">*</span>
                </label>

                <input
                  name="customerPhone"
                  type="tel"
                  required
                  defaultValue={order.customerPhone ?? ""}
                  placeholder="Example: 01012345678"
                  className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black"
                />

                <p className="mt-2 text-xs leading-5 text-black/50">
                  We’ll use this number only to follow up on your order and
                  confirm production details.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-black">
                  Email address
                </label>

                <input
                  name="customerEmail"
                  type="email"
                  defaultValue={order.customerEmail ?? ""}
                  placeholder="you@example.com"
                  className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black"
                />
              </div>

              <div className="rounded-2xl border border-[#a56a2a]/20 bg-[#fff8f1] p-4">
                <p className="text-sm font-semibold text-black">
                  What happens after payment?
                </p>

                <p className="mt-2 text-sm leading-6 text-black/60">
                  Your order will be marked as paid, then our team will contact
                  you to confirm the artwork, production details, and estimated
                  timeline before production starts.
                </p>
              </div>

              <button
                type="submit"
                className="h-12 w-full rounded-xl bg-black px-6 text-sm font-semibold text-white hover:opacity-90"
              >
                Continue to Payment
              </button>
            </form>
          </section>

          <aside className="rounded-[28px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
            <h2 className="text-lg font-semibold">Order summary</h2>

            <div className="mt-5 rounded-2xl border border-black/10 p-4">
              <p className="font-semibold">Custom T-Shirt</p>

              {item ? (
                <p className="mt-1 text-sm text-black/50">
                  {item.product} · {item.fabric} · {item.color}
                </p>
              ) : null}
            </div>

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

            <div className="mt-6 rounded-2xl border border-black/10 bg-[#faf8f6] p-4">
              <p className="text-xs uppercase tracking-wide text-black/40">
                Currency
              </p>

              <p className="mt-1 font-semibold">USD</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}