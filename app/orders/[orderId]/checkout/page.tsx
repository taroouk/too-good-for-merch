import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "src/lib/prisma";

type CheckoutPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

function money(cents: number, currency = "EGP"): string {
  try {
    return new Intl.NumberFormat("en-EG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function titleCase(value: string | null | undefined): string {
  if (!value) return "Not selected";

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          asset: true,
        },
      },
    },
  });

  if (!order) notFound();

  const item = order.items[0];
  const currency = order.currency || "EGP";

  return (
    <main className="min-h-screen bg-[#f4efe7] px-4 py-6 text-black sm:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-[28px] border border-black/10 bg-white/80 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.07)] sm:flex-row sm:items-center">
          <Link href={`/orders/${order.id}`} className="text-sm font-semibold text-black/60 hover:text-black">
            ← Back to order
          </Link>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
            <span className="rounded-full border border-black/10 bg-white px-3 py-2">Paymob checkout</span>
            <span className="rounded-full border border-black/10 bg-white px-3 py-2">Order {order.orderNumber}</span>
          </div>
        </div>

        <section className="relative overflow-hidden rounded-[38px] bg-black px-5 py-8 text-white shadow-[0_28px_100px_rgba(0,0,0,0.18)] sm:px-8 lg:px-10">
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[#d8a96f]/30 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_420px] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/50">Final step</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Review your order and complete payment.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">
                Confirm your contact details, then continue to the payment screen. After payment, the production team will follow up with the final artwork and timeline.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/15 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-white/45">Amount due</p>
              <p className="mt-2 text-3xl font-semibold">{money(order.totalCents, currency)}</p>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                <span className="rounded-2xl bg-white/10 px-2 py-3">Details</span>
                <span className="rounded-2xl bg-white px-2 py-3 text-black">Payment</span>
                <span className="rounded-2xl bg-white/10 px-2 py-3">Confirm</span>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
          <section className="rounded-[34px] bg-white p-5 shadow-[0_20px_80px_rgba(0,0,0,0.07)] sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#a56a2a]">Customer information</p>
            <h2 className="mt-2 text-2xl font-semibold">Contact details</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-black/55">
              Add accurate details so we can confirm artwork, sizing, delivery timing, and final notes.
            </p>

            <form action="/api/payments/paymob/create" method="POST" className="mt-7 space-y-6">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="paymentProvider" value="paymob" />

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-black">Full name</label>
                  <input
                    name="customerName"
                    type="text"
                    autoComplete="name"
                    defaultValue={order.customerName ?? ""}
                    placeholder="Your full name"
                    className="mt-2 h-13 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none transition focus:border-black focus:bg-white focus:shadow-[0_0_0_4px_rgba(0,0,0,0.06)]"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-black">
                    Phone number <span className="text-[#a56a2a]">*</span>
                  </label>
                  <input
                    name="customerPhone"
                    type="tel"
                    required
                    autoComplete="tel"
                    defaultValue={order.customerPhone ?? ""}
                    placeholder="Example: 01012345678"
                    className="mt-2 h-13 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none transition focus:border-black focus:bg-white focus:shadow-[0_0_0_4px_rgba(0,0,0,0.06)]"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-black">Email address</label>
                  <input
                    name="customerEmail"
                    type="email"
                    autoComplete="email"
                    defaultValue={order.customerEmail ?? ""}
                    placeholder="you@example.com"
                    className="mt-2 h-13 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none transition focus:border-black focus:bg-white focus:shadow-[0_0_0_4px_rgba(0,0,0,0.06)]"
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-black/10 bg-[#fbfaf7] p-4 sm:p-5">
                <p className="text-sm font-semibold">Payment method</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="relative flex cursor-pointer gap-4 rounded-3xl border-2 border-black bg-white p-4 shadow-[0_14px_40px_rgba(0,0,0,0.06)]">
                    <input className="mt-1" type="radio" name="paymentMethod" value="card" defaultChecked />
                    <span>
                      <span className="block text-sm font-semibold">Online payment</span>
                      <span className="mt-1 block text-xs leading-5 text-black/50">Continue to the configured Paymob checkout experience.</span>
                    </span>
                    <span className="absolute right-4 top-4 rounded-full bg-black px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Active</span>
                  </label>

                  <label className="flex cursor-not-allowed gap-4 rounded-3xl border border-black/10 bg-white/70 p-4 opacity-70">
                    <input className="mt-1" type="radio" name="paymentMethod" value="wallet" disabled />
                    <span>
                      <span className="block text-sm font-semibold">Wallet option</span>
                      <span className="mt-1 block text-xs leading-5 text-black/50">Ready to enable when the wallet integration is configured.</span>
                    </span>
                  </label>
                </div>
              </div>

              <button type="submit" className="group flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-black px-6 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:opacity-95">
                Continue to payment
                <span className="transition group-hover:translate-x-1">→</span>
              </button>
            </form>
          </section>

          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <div className="overflow-hidden rounded-[34px] bg-white shadow-[0_20px_80px_rgba(0,0,0,0.07)]">
              <div className="border-b border-black/10 p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#a56a2a]">Order summary</p>
                <h2 className="mt-2 text-2xl font-semibold">{order.orderNumber}</h2>
              </div>

              <div className="p-5 sm:p-6">
                <div className="rounded-[28px] border border-black/10 bg-[#fbfaf7] p-4">
                  <div className="flex gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-xs text-black/40">
                      {item?.asset?.url ? <img src={item.asset.url} alt={item.asset.fileName} className="h-full w-full object-contain" /> : "Artwork"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold">Custom T-Shirt</p>
                      {item ? (
                        <p className="mt-1 text-sm leading-6 text-black/50">
                          {titleCase(item.product)} · {titleCase(item.fabric)} · {titleCase(item.color)}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-black/50">No item attached</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-black/50">Subtotal</span>
                    <span className="font-medium">{money(order.subtotalCents, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-black/50">Shipping</span>
                    <span className="font-medium">To be confirmed</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-black/50">Payment gateway</span>
                    <span className="font-medium">Paymob</span>
                  </div>
                  <div className="border-t border-black/10 pt-4">
                    <div className="flex items-end justify-between">
                      <span className="font-semibold">Total due</span>
                      <span className="text-2xl font-semibold text-[#a56a2a]">{money(order.totalCents, currency)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[34px] border border-black/10 bg-white p-5 shadow-[0_20px_80px_rgba(0,0,0,0.07)] sm:p-6">
              <h3 className="text-lg font-semibold">What happens next?</h3>
              <div className="mt-4 space-y-4 text-sm leading-6 text-black/60">
                <p>1. The order total is read from the server order record.</p>
                <p>2. The payment session is created for this order only.</p>
                <p>3. The admin dashboard tracks payment and production status.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
