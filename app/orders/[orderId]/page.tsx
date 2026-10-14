import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "src/auth";
import { isAdminSession } from "src/lib/admin/auth";
import { prisma } from "src/lib/prisma";
import { formatExchangeRate, formatMoney, itemDisplayCurrency, orderItemExtras, resolveOrderMockupIds } from "src/lib/orders/display";
import PaymentStatusClient from "./PaymentStatusClient";

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/orders/${orderId}`)}`);

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) notFound();
  if (order.userId !== session.user.id && !(await isAdminSession())) notFound();

  // Paymob's payment_keys call is created with expiration: 3600 (see
  // createPaymobPayment) - the hosted payment link itself expires after an
  // hour. If the most recent attempt is older than that and the order is
  // still awaiting a webhook, the customer's polling would otherwise spin
  // on "waiting for confirmation" forever with no way out.
  const latestAttempt = await prisma.paymentAttempt.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  // OrderItem money is canonical USD on the current pricing model, while
  // Order.totalCents is what Paymob actually charged (EGP) -- see
  // src/lib/orders/checkout.ts. Labelling line items with order.currency
  // reported a USD figure as EGP, understating each item by roughly the
  // exchange rate. itemDisplayCurrency is the one helper that gets this
  // split right, including for pre-split historical orders.
  const itemCurrency = itemDisplayCurrency(order);
  const showsConversion = itemCurrency !== order.currency;

  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="mx-auto max-w-2xl">
        <Link href="/orders" className="text-sm font-semibold text-black/55 hover:text-black">
          Your orders
        </Link>
        <section className="mt-5 rounded-[30px] bg-white p-6 shadow-[0_20px_80px_rgba(0,0,0,.08)] sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">{order.orderNumber}</p>
          <h1 className="mt-2 text-3xl font-semibold">Payment status</h1>
          <PaymentStatusClient
            orderId={order.id}
            initialStatus={order.paymentStatus}
            retryEnabled={order.paymentStatus !== "PAID"}
            latestAttemptAt={latestAttempt?.createdAt.toISOString() ?? null}
          />
          {order.shippedAt && order.carrier ? (
            <div className="mt-7 rounded-2xl bg-[#f3f1ed] p-5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">
                {order.status === "COMPLETED" ? "Delivered" : "Shipped"} · {order.shippedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
              <p className="mt-2">
                <strong>{order.carrier}</strong>
                {order.trackingNumber ? <span className="ml-2 font-mono text-black/70">{order.trackingNumber}</span> : null}
              </p>
              {order.trackingUrl ? (
                <a href={order.trackingUrl} target="_blank" rel="noreferrer noopener" className="mt-3 inline-block rounded-full bg-black px-5 py-2.5 text-xs font-semibold text-white">
                  Track your parcel
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="mt-7 border-t border-black/10 pt-6">
            {order.items.map((item) => {
              const extras = orderItemExtras(item.preview);
              const mockups = resolveOrderMockupIds(item.preview, null);
              const imageId = mockups.printMockupId ?? mockups.aiMockupId;
              const image = imageId ? `/api/mockups/${imageId}/file` : extras.savedArtworkId ? `/api/artworks/${extras.savedArtworkId}/file` : null;
              return (
                <div key={item.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span className="flex items-center gap-3">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="Your design" className="h-16 w-16 shrink-0 rounded-xl bg-[#efece6] object-contain" />
                    ) : null}
                    <span>
                      {item.quantity}x {item.product.replaceAll("_", " ")} - {item.fabric.replaceAll("_", " ")}
                      {extras.size ? <span className="ml-1 text-black/50">· Size {extras.size}</span> : null}
                    </span>
                  </span>
                  <strong>{formatMoney(item.totalCents, itemCurrency)}</strong>
                </div>
              );
            })}
            <div className="mt-3 flex items-center justify-between border-t border-black/10 pt-4 text-lg">
              <strong>Total charged</strong>
              <strong>{formatMoney(order.totalCents, order.currency)}</strong>
            </div>
            {showsConversion ? (
              <p className="mt-2 text-xs text-black/45">
                Items are shown in {itemCurrency}. You were charged in {order.currency}
                {order.exchangeRateUsed
                  ? ` at 1 ${itemCurrency} = ${formatExchangeRate(order.exchangeRateUsed)} ${order.currency}`
                  : ""}
                , and the total includes tax and shipping.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
