import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { formatMoney, orderItemExtras, resolveOrderMockupIds } from "src/lib/orders/display";
import { ORDER_FILTERS, customerOrderStatus, matchesOrderFilter, parseOrderFilter, type StatusTone } from "src/lib/orders/customer-view";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-black/5 text-black/70",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-sky-100 text-sky-800",
  success: "bg-emerald-100 text-emerald-800",
  danger: "bg-red-100 text-red-700",
};

const titleCase = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/orders");
  const filter = parseOrderFilter((await searchParams).filter);

  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });

  const counts = new Map(ORDER_FILTERS.map((f) => [f.key, orders.filter((order) => matchesOrderFilter(order, f.key)).length]));
  const visible = orders.filter((order) => matchesOrderFilter(order, filter));

  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">Account</p>
            <h1 className="mt-2 text-4xl font-semibold">My orders</h1>
            <p className="mt-2 text-sm text-black/50">
              {orders.length ? `${orders.length} order${orders.length === 1 ? "" : "s"} · track status, see what you ordered and where it's going.` : "Everything you order will show up here."}
            </p>
          </div>
          <Link href="/studio" className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
            Design a T-shirt
          </Link>
        </div>

        {orders.length ? (
          <nav className="mt-8 flex gap-2 overflow-x-auto pb-1" aria-label="Filter orders">
            {ORDER_FILTERS.map((f) => {
              const active = f.key === filter;
              const count = counts.get(f.key) ?? 0;
              if (f.key !== "all" && count === 0 && !active) return null;
              return (
                <Link
                  key={f.key}
                  href={f.key === "all" ? "/orders" : `/orders?filter=${f.key}`}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-black text-white" : "bg-white text-black/60 hover:text-black"}`}
                >
                  {f.label} <span className={active ? "text-white/60" : "text-black/35"}>{count}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="mt-6 space-y-4">
          {visible.map((order) => {
            const status = customerOrderStatus(order);
            const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
            const first = order.items[0];
            const thumbs = order.items.slice(0, 3).map((item) => {
              const mockups = resolveOrderMockupIds(item.preview, null);
              const imageId = mockups.printMockupId ?? mockups.aiMockupId;
              const extras = orderItemExtras(item.preview);
              return imageId ? `/api/mockups/${imageId}/file` : extras.savedArtworkId ? `/api/artworks/${extras.savedArtworkId}/file` : null;
            });
            const size = first ? orderItemExtras(first.preview).size : null;
            return (
              <article key={order.id} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-black/40">Order</p>
                    <p className="font-semibold">{order.orderNumber}</p>
                  </div>
                  <div className="text-sm text-black/55">
                    <span className="block text-xs uppercase tracking-[.16em] text-black/35">Placed</span>
                    {order.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </div>
                  <div className="text-sm">
                    <span className="block text-xs uppercase tracking-[.16em] text-black/35">Total</span>
                    <strong>{formatMoney(order.totalCents, order.currency)}</strong>
                  </div>
                  <span className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${TONE_CLASS[status.tone]}`}>{status.label}</span>
                </div>

                <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
                  <div className="flex shrink-0 -space-x-3">
                    {thumbs.length ? (
                      thumbs.map((src, index) =>
                        src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={index} src={src} alt="Your design" className="h-20 w-20 rounded-2xl border-2 border-white bg-[#efece6] object-contain" />
                        ) : (
                          <span key={index} className="h-20 w-20 rounded-2xl border-2 border-white bg-[#efece6]" />
                        ),
                      )
                    ) : (
                      <span className="h-20 w-20 rounded-2xl bg-[#efece6]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">
                      {first ? `${first.quantity} × ${titleCase(first.product)} · ${titleCase(first.fabric)}` : "Order"}
                      {order.items.length > 1 ? <span className="font-normal text-black/50"> + {order.items.length - 1} more</span> : null}
                    </p>
                    <p className="mt-1 text-black/55">
                      {itemCount} item{itemCount === 1 ? "" : "s"}
                      {first ? ` · ${titleCase(first.color)}` : ""}
                      {size ? ` · Size ${size}` : ""}
                    </p>
                    <p className="mt-2 text-black/60">{status.description}</p>
                    {order.trackingNumber ? (
                      <p className="mt-2 text-xs text-black/55">
                        {order.carrier ? <strong>{order.carrier}</strong> : "Tracking"} <span className="font-mono">{order.trackingNumber}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                    <Link href={`/orders/${order.id}`} className="rounded-xl bg-black px-5 py-2.5 text-center text-sm font-semibold text-white">
                      {status.key === "awaiting-payment" || status.key === "payment-failed" ? "Complete payment" : "View details"}
                    </Link>
                    {order.trackingUrl ? (
                      <a href={order.trackingUrl} target="_blank" rel="noreferrer noopener" className="rounded-xl border border-black/15 px-5 py-2.5 text-center text-sm font-semibold text-black/70 hover:border-black hover:text-black">
                        Track parcel
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}

          {!orders.length ? (
            <div className="rounded-3xl bg-white p-12 text-center">
              <p className="text-lg font-semibold">No orders yet</p>
              <p className="mt-2 text-sm text-black/50">Design your first T-shirt and it will appear here.</p>
              <Link href="/studio" className="mt-6 inline-block rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white">Open the studio</Link>
            </div>
          ) : !visible.length ? (
            <div className="rounded-3xl bg-white p-10 text-center text-sm text-black/50">
              No orders in this view. <Link href="/orders" className="font-semibold text-black underline">Show all orders</Link>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
