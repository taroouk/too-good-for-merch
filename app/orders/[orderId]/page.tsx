import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { formatExchangeRate, formatMoney, itemDisplayCurrency } from "src/lib/orders/display";
import PaymentStatusClient from "./PaymentStatusClient";

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/orders/${orderId}`)}`);

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) notFound();
  if (session.user.role !== Role.ADMIN && order.userId !== session.user.id) notFound();

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
          <div className="mt-7 border-t border-black/10 pt-6">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span>
                  {item.quantity}x {item.product.replaceAll("_", " ")} - {item.fabric.replaceAll("_", " ")}
                </span>
                <strong>{formatMoney(item.totalCents, itemCurrency)}</strong>
              </div>
            ))}
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
