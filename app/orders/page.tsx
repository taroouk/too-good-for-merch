import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { duplicateReviewIdsFor } from "src/lib/orders/duplicate-review-db";
import AccountNav from "src/components/site/AccountNav";
import { formatMinorPrice } from "src/pricing/display";
import { orderArtworkLayers, orderItemExtras, resolveOrderMockupIds } from "src/lib/orders/display";
import { orderItemPreviewUrl } from "src/lib/mockup-preview";
import ProductCard, { CARD_BUTTON_PRIMARY, CARD_BUTTON_SECONDARY, CARD_GRID_CLASS, PAGE_BUTTON_CLASS } from "src/components/site/ProductCard";
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

  const rawOrders = await prisma.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  // Paid orders whose design was also paid on another order are shown as "Payment received — under review", not "Confirmed".
  const reviewIds = await duplicateReviewIdsFor(session.user.id, rawOrders);
  const orders = rawOrders.map((order) => ({ ...order, paymentUnderReview: reviewIds.has(order.id) }));

  // Each order's picture is the customer's own mockup, checked against what
  // they ordered (cut, colour, design) -- see src/lib/mockup-preview.ts.
  const mockupIds = [
    ...new Set(
      orders.flatMap((order) =>
        order.items.flatMap((item) => {
          const ids = resolveOrderMockupIds(item.preview, null);
          return [ids.printMockupId, ids.aiMockupId].filter((id): id is string => Boolean(id));
        }),
      ),
    ),
  ];
  const fingerprints = new Map(
    (mockupIds.length
      ? await prisma.mockup.findMany({ where: { id: { in: mockupIds } }, select: { id: true, fingerprint: true } })
      : []
    ).map((row) => [row.id, row.fingerprint] as const),
  );

  const counts = new Map(ORDER_FILTERS.map((f) => [f.key, orders.filter((order) => matchesOrderFilter(order, f.key)).length]));
  const visible = orders.filter((order) => matchesOrderFilter(order, filter));

  return (
    <main className="min-h-screen bg-[#f3f1ed] px-4 py-12 text-black">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/40">Account</p>
            <h1 className="mt-2 text-4xl font-semibold">My Orders</h1>
            <p className="mt-2 text-sm text-black/50">
              {orders.length ? `${orders.length} order${orders.length === 1 ? "" : "s"} · Track your orders and deliveries.` : "Everything you order will show up here."}
            </p>
          </div>
          <Link href="/studio" className={PAGE_BUTTON_CLASS}>
            Open Studio
          </Link>
        </div>

        <AccountNav />

        {orders.length ? (
          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter orders">
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

        <div className="mt-6">
          <div className={visible.length ? CARD_GRID_CLASS.replace("mt-8 ", "") : ""}>
          {visible.map((order) => {
            const status = customerOrderStatus(order);
            const first = order.items[0];
            const extras = first ? orderItemExtras(first.preview) : null;
            const image = first
              ? orderItemPreviewUrl(first, resolveOrderMockupIds(first.preview, null), fingerprints, orderArtworkLayers(first.preview))
              : null;
            const payNow = status.key === "awaiting-payment" || status.key === "payment-failed";
            return (
              <ProductCard
                key={order.id}
                image={image}
                imageAlt="Your design"
                title={first ? `${first.quantity} × ${titleCase(first.product)}${order.items.length > 1 ? ` + ${order.items.length - 1} more` : ""}` : "Order"}
                price={formatMinorPrice(order.totalCents, order.currency)}
                badge={<span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${TONE_CLASS[status.tone]}`}>{status.label}</span>}
                details={[
                  ["Order", order.orderNumber],
                  ["Placed", order.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })],
                  // One payment can cover several items: say so instead of describing only the first one.
                  ...(order.items.length > 1
                    ? ([["Items", String(order.items.length)]] as Array<[string, string]>)
                    : [
                        ...(first ? ([["Colour", titleCase(first.color)], ["Fabric", titleCase(first.fabric)]] as Array<[string, string]>) : []),
                        ...(extras?.size ? ([["Size", extras.size]] as Array<[string, string]>) : []),
                      ]),
                ]}
                note={
                  <>
                    {status.description}
                    {order.trackingNumber ? (
                      <span className="mt-1 block">
                        {order.carrier ? <strong>{order.carrier}</strong> : "Tracking"} <span className="font-mono">{order.trackingNumber}</span>
                      </span>
                    ) : null}
                  </>
                }
                actions={
                  <>
                    <Link href={`/orders/${order.id}`} className={CARD_BUTTON_PRIMARY}>
                      {payNow ? "Complete payment" : "View details"}
                    </Link>
                    {order.trackingUrl ? (
                      <a href={order.trackingUrl} target="_blank" rel="noreferrer noopener" className={CARD_BUTTON_SECONDARY}>
                        Track parcel
                      </a>
                    ) : null}
                  </>
                }
              />
            );
          })}
          </div>

          {!orders.length ? (
            <div className="rounded-3xl bg-white p-12 text-center">
              <p className="text-lg font-semibold">No orders yet</p>
              <p className="mt-2 text-sm text-black/50">Design your first T-shirt and it will appear here.</p>
              <Link href="/studio" className={`${PAGE_BUTTON_CLASS} mt-6`}>Open Studio</Link>
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
