import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "src/auth";
import { isAdminSession } from "src/lib/admin/auth";
import { prisma } from "src/lib/prisma";
import { WHATSAPP_URL } from "src/lib/contact";
import {
  formatExchangeRate,
  formatMoney,
  formatShippingAddress,
  orderArtworkLayers,
  orderItemExtras,
  orderPaymentBreakdown,
  resolveOrderMockupIds,
} from "src/lib/orders/display";
import { customerOrderStatus, itemAmountsInChargedCurrency, orderTimeline, paymentMethodLabel, type StatusTone } from "src/lib/orders/customer-view";
import { placementLabel, type PlacementKey } from "src/pricing/placements";
import PaymentStatusClient from "./PaymentStatusClient";
import PrintButton from "./PrintButton";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-black/5 text-black/70",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-sky-100 text-sky-800",
  success: "bg-emerald-100 text-emerald-800",
  danger: "bg-red-100 text-red-700",
};

const titleCase = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const dateTime = (date: Date) => date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = (date: Date) => date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-white p-6 shadow-sm sm:p-7 print:shadow-none print:ring-1 print:ring-black/10 ${className}`}>
      <h2 className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/orders/${orderId}`)}`);

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { createdAt: "asc" } } } });
  if (!order) notFound();
  if (order.userId !== session.user.id && !(await isAdminSession())) notFound();

  // Paymob's payment link expires after an hour (see createPaymobPayment); the
  // client uses the last attempt time to offer a fresh link instead of
  // spinning forever on "waiting for confirmation".
  const latestAttempt = await prisma.paymentAttempt.findFirst({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const status = customerOrderStatus(order);
  const timeline = orderTimeline(order);
  const needsPayment = order.status !== "CANCELLED" && ["UNPAID", "PENDING", "FAILED"].includes(order.paymentStatus);

  // Item money is canonical USD on the current pricing model but the customer
  // was charged in the payment currency: show each line in what they paid.
  const amounts = itemAmountsInChargedCurrency(order.items, order);
  const itemCurrency = order.currency;
  const breakdown = orderPaymentBreakdown(order);
  const address = formatShippingAddress(order);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/orders" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-black/55 hover:text-black">← My orders</Link>
          <PrintButton />
        </div>

        <header className="mt-5 rounded-3xl bg-white p-6 shadow-sm sm:p-8 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">Order</p>
              <h1 className="mt-1 text-3xl font-semibold">{order.orderNumber}</h1>
              <p className="mt-2 text-sm text-black/55">
                Placed {dateTime(order.createdAt)} · {itemCount} item{itemCount === 1 ? "" : "s"}
              </p>
            </div>
            <span className={`rounded-full px-4 py-2 text-sm font-semibold ${TONE_CLASS[status.tone]}`}>{status.label}</span>
          </div>
          <p className="mt-4 text-sm text-black/65">{status.description}</p>

          {timeline ? (
            <ol className="mt-7 grid gap-4 sm:grid-cols-5" aria-label="Order progress">
              {timeline.map((step) => (
                <li key={step.key} className="flex items-start gap-3 sm:block">
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      step.state === "done" ? "bg-black text-white" : step.state === "current" ? "border-2 border-black bg-white text-black" : "border border-black/15 bg-white text-black/25"
                    }`}
                  >
                    {step.state === "done" ? "✓" : ""}
                  </span>
                  <div className="sm:mt-2">
                    <p className={`text-sm font-semibold ${step.state === "upcoming" ? "text-black/35" : "text-black"}`}>{step.label}</p>
                    <p className="text-xs text-black/45">{step.at ? dateOnly(step.at) : step.state === "current" ? "In progress" : ""}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </header>

        {needsPayment ? (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8 print:hidden">
            <h2 className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">Payment</h2>
            <PaymentStatusClient
              orderId={order.id}
              initialStatus={order.paymentStatus}
              retryEnabled
              latestAttemptAt={latestAttempt?.createdAt.toISOString() ?? null}
            />
          </section>
        ) : null}

        {order.shippedAt && order.carrier ? (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm sm:p-8 print:shadow-none print:ring-1 print:ring-black/10">
            <h2 className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">
              {order.status === "COMPLETED" ? "Delivered" : "Shipped"} · {dateOnly(order.shippedAt)}
            </h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p>
                <strong>{order.carrier}</strong>
                {order.trackingNumber ? <span className="ml-2 font-mono text-black/70">{order.trackingNumber}</span> : null}
              </p>
              {order.trackingUrl ? (
                <a href={order.trackingUrl} target="_blank" rel="noreferrer noopener" className="rounded-full bg-black px-5 py-2.5 text-xs font-semibold text-white print:hidden">
                  Track your parcel
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Card title={`Items (${order.items.length})`} className="self-start">
            <div className="divide-y divide-black/10">
              {order.items.map((item, index) => {
                const extras = orderItemExtras(item.preview);
                const mockups = resolveOrderMockupIds(item.preview, null);
                const front = mockups.printMockupId ?? mockups.aiMockupId;
                const back = mockups.backPrintMockupId ?? mockups.backAiMockupId;
                const images = [
                  front ? `/api/mockups/${front}/file` : extras.savedArtworkId ? `/api/artworks/${extras.savedArtworkId}/file` : null,
                  back ? `/api/mockups/${back}/file` : null,
                ].filter((src): src is string => Boolean(src));
                const layers = orderArtworkLayers(item.preview);
                const positions = layers.length
                  ? layers.map((layer) => placementLabel(layer.placement as PlacementKey))
                  : Array.isArray(item.placements)
                    ? (item.placements as unknown[]).filter((p): p is string => typeof p === "string").map((p) => placementLabel(p as PlacementKey))
                    : [];
                const money = amounts[index];
                return (
                  <article key={item.id} className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row">
                    <div className="flex shrink-0 gap-2">
                      {images.length ? (
                        images.map((src) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={src} src={src} alt="Your design" className="h-28 w-28 rounded-2xl bg-[#efece6] object-contain" />
                        ))
                      ) : (
                        <span className="h-28 w-28 rounded-2xl bg-[#efece6]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="text-base font-semibold">{titleCase(item.product)} T-shirt</p>
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-black/65">
                        <dt className="text-black/40">Fabric</dt><dd>{titleCase(item.fabric)}</dd>
                        <dt className="text-black/40">Colour</dt><dd>{titleCase(item.color)}</dd>
                        {extras.size ? (<><dt className="text-black/40">Size</dt><dd>{extras.size}</dd></>) : null}
                        <dt className="text-black/40">Quantity</dt><dd>{item.quantity}</dd>
                        {positions.length ? (<><dt className="text-black/40">Print</dt><dd>{positions.join(", ")}</dd></>) : null}
                        {extras.notes ? (<><dt className="text-black/40">Your notes</dt><dd className="whitespace-pre-line">{extras.notes}</dd></>) : null}
                      </dl>
                    </div>
                    <div className="shrink-0 text-sm sm:text-right">
                      <p className="font-semibold">{formatMoney(money.totalCents, itemCurrency)}</p>
                      {item.quantity > 1 ? <p className="text-xs text-black/45">{formatMoney(money.unitCents, itemCurrency)} each</p> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </Card>

          <div className="space-y-6">
            <Card title="Order summary">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-black/55">Items subtotal</dt><dd>{formatMoney(breakdown.subtotalCents, order.currency)}</dd></div>
                {breakdown.surchargeCents !== 0 ? (
                  <div className="flex justify-between"><dt className="text-black/55">Shipping &amp; tax</dt><dd>{formatMoney(breakdown.surchargeCents, order.currency)}</dd></div>
                ) : null}
                <div className="flex justify-between border-t border-black/10 pt-3 text-base"><dt className="font-semibold">Total {order.paymentStatus === "PAID" ? "paid" : "charged"}</dt><dd className="font-semibold">{formatMoney(order.totalCents, order.currency)}</dd></div>
              </dl>
              {order.exchangeRateUsed && order.canonicalTotalUsdCents != null ? (
                <p className="mt-3 text-xs text-black/45">
                  Priced at {formatMoney(order.canonicalTotalUsdCents, "USD")} and charged in {order.currency} at 1 USD = {formatExchangeRate(order.exchangeRateUsed)} {order.currency}.
                </p>
              ) : null}
            </Card>

            <Card title="Payment">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-black/55">Status</dt><dd className="font-medium">{order.paymentStatus === "PAID" ? "Paid" : order.paymentStatus === "REFUNDED" ? "Refunded" : order.paymentStatus === "FAILED" ? "Failed" : "Awaiting payment"}</dd></div>
                {order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED" ? (
                  <>
                    <div className="flex justify-between gap-4"><dt className="text-black/55">Method</dt><dd>{paymentMethodLabel(order.paymentMethod)}</dd></div>
                    {order.paidAt ? <div className="flex justify-between gap-4"><dt className="text-black/55">Paid on</dt><dd>{dateTime(order.paidAt)}</dd></div> : null}
                  </>
                ) : null}
                {order.refundedAt ? <div className="flex justify-between gap-4"><dt className="text-black/55">Refunded on</dt><dd>{dateTime(order.refundedAt)}</dd></div> : null}
              </dl>
            </Card>

            <Card title="Delivery">
              {address.length || order.customerName ? (
                <div className="space-y-1 text-sm text-black/70">
                  {order.customerName ? <p className="font-semibold text-black">{order.customerName}</p> : null}
                  {address.map((line) => <p key={line}>{line}</p>)}
                  {order.customerPhone ? <p className="pt-1">{order.customerPhone}</p> : null}
                  {order.customerEmail ? <p>{order.customerEmail}</p> : null}
                </div>
              ) : (
                <p className="text-sm text-black/50">No delivery address was recorded for this order.</p>
              )}
            </Card>

            <Card title="Need help?" className="print:hidden">
              <p className="text-sm text-black/60">Questions about this order? Mention <strong>{order.orderNumber}</strong> and we&apos;ll sort it out.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={WHATSAPP_URL} target="_blank" rel="noreferrer noopener" className="rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white">WhatsApp us</a>
                <Link href="/contact" className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-black/70 hover:border-black hover:text-black">Contact</Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
