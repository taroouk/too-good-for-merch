import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import {
  addAdminNoteAction,
  updateOrderStatusAction,
} from "src/actions/admin-order-actions";
import AdminToast from "src/components/admin/AdminToast";
import {
  formatExchangeRate,
  formatShippingAddress,
  formatMoney,
  isNewPricingModel,
  itemDisplayCurrency,
  orderPaymentBreakdown,
  orderUsdSurcharges,
  resolveOrderMockupIds,
  orderArtworkLayers,
} from "src/lib/orders/display";
import { placementLabel } from "src/pricing/placements";
import Breadcrumbs from "src/components/admin/ui/Breadcrumbs";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import EmptyState from "src/components/admin/ui/EmptyState";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import { buttonClass } from "src/components/admin/ui/Button";
import { ORDER_STATUS_LABELS, orderStatusTone, paymentStatusTone } from "src/components/admin/ui/status";

type AdminOrderDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{ notice?: string }>;
};

const allowedStatusFlow: Record<OrderStatus, OrderStatus[]> = {
  NEW: [OrderStatus.CANCELLED],
  PAID: [OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
  IN_PRODUCTION: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [OrderStatus.NEW],
};

const money = formatMoney;

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function placementsText(placements: unknown): string {
  if (Array.isArray(placements)) {
    const validPlacements = placements.filter(
      (placement): placement is string => typeof placement === "string",
    );

    if (validPlacements.length > 0) {
      return validPlacements.join(", ");
    }
  }

  return "Saved";
}

export default async function AdminOrderDetailsPage({
  params,
  searchParams,
}: AdminOrderDetailsPageProps) {
  const { id } = await params;
  const query = await searchParams;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          email: true,
          phone: true,
        },
      },
      build: {
        include: {
          // Only used as a fallback for orders placed before OrderItem.preview
          // snapshotted these pointers (see resolveOrderMockupIds below) --
          // never treat this live BuildDraft state as authoritative for a
          // paid order.
          draft: { select: { printMockupId: true, aiMockupId: true } },
        },
      },
      items: {
        include: {
          // Only url/fileName/mimeType are read below -- the full row also
          // carries artworkData (up to 10MB of raw artwork bytes per item),
          // which this page never renders and which would otherwise be
          // pulled into the RSC payload on every order-detail view.
          asset: { select: { url: true, fileName: true, mimeType: true } },
        },
      },
      notes: {
        orderBy: {
          createdAt: "desc",
        },
        include: {
          author: {
            select: {
              email: true,
            },
          },
        },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { admin: { select: { email: true } } },
      },
    },
  });

  if (!order) {
    notFound();
  }

  const nextStatuses = allowedStatusFlow[order.status];

  // See src/lib/orders/display.ts for the reasoning behind these two.
  const isNewOrder = isNewPricingModel(order);
  const itemCurrency = itemDisplayCurrency(order);
  // P1-8: prefer the purchase-time mockup snapshot on the first item's
  // preview over the live (mutable) BuildDraft pointers.
  const { printMockupId, aiMockupId, backPrintMockupId, backAiMockupId } = resolveOrderMockupIds(
    order.items[0]?.preview,
    order.build?.draft,
  );
  // Multi-artwork orders: every artwork with its placement and position, as
  // frozen at checkout (what production prints).
  const printLayers = orderArtworkLayers(order.items[0]?.preview);
  const printLayerAssets = printLayers.length
    ? await prisma.asset.findMany({
        where: { id: { in: printLayers.map((layer) => layer.assetId) } },
        select: { id: true, url: true, fileName: true },
      })
    : [];
  const printLayerAssetById = new Map(printLayerAssets.map((asset) => [asset.id, asset]));
  const mockupCards = [
    { id: printMockupId, title: "Print mockup — front", note: "Deterministic compositor output, used for production." },
    { id: backPrintMockupId, title: "Print mockup — back", note: "Deterministic compositor output, used for production." },
    { id: aiMockupId, title: "AI mockup — front", note: "AI-enhanced preview shown to the customer." },
    { id: backAiMockupId, title: "AI mockup — back", note: "AI-enhanced preview shown to the customer." },
  ].filter((card): card is { id: string; title: string; note: string } => Boolean(card.id));
  // P3-21d: a payment-currency breakdown that reconciles exactly, plus the
  // canonical USD tax/shipping snapshot reported alongside it (never summed
  // into it -- see src/lib/orders/display.ts).
  const breakdown = orderPaymentBreakdown(order);
  const usdSurcharges = orderUsdSurcharges(order.items[0]?.preview);

  return (
    <main className="px-4 py-10">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <Breadcrumbs items={[{ label: "Orders", href: "/admin/orders" }, { label: order.orderNumber }]} />

        <Card className="mb-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm text-admin-faint">Created {formatDateTime(order.createdAt)}</p>
              <h1 className="mt-1 text-3xl font-semibold text-admin-ink">{order.orderNumber}</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-admin-muted">
                Manage this order&apos;s production workflow, payment state, customer details, artwork, items, and internal notes.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
              <Badge tone={paymentStatusTone(order.paymentStatus)}>Payment {order.paymentStatus}</Badge>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <section className="space-y-6">
            <Card title="Order items" subtitle={isNewOrder ? "Item prices are shown in USD, the canonical pricing currency." : undefined}>
              <div className="space-y-4">
                {order.items.length > 0 ? (
                  order.items.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-admin-border p-5">
                      <div className="flex flex-col gap-5 sm:flex-row">
                        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-2xl bg-admin-canvas text-xs text-admin-faint">
                          {item.asset?.url ? (
                            <img src={item.asset.url} alt={item.asset.fileName} className="h-full w-full rounded-2xl object-contain" />
                          ) : (
                            "No artwork"
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col justify-between gap-3 sm:flex-row">
                            <div>
                              <p className="text-lg font-semibold text-admin-ink">Custom T-Shirt</p>
                              <p className="mt-1 text-sm text-admin-muted">{item.product} · {item.fabric} · {item.color}</p>
                            </div>
                            <p className="text-xl font-semibold text-admin-ink">{money(item.totalCents, itemCurrency)}</p>
                          </div>

                          <div className="mt-5 grid gap-4 text-sm sm:grid-cols-4">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-admin-faint">Quantity</p>
                              <p className="mt-1 font-semibold text-admin-ink">{item.quantity}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-admin-faint">Unit price</p>
                              <p className="mt-1 font-semibold text-admin-ink">{money(item.unitPriceCents, itemCurrency)}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-admin-faint">Placement</p>
                              <p className="mt-1 font-semibold text-admin-ink">{placementsText(item.placements)}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-admin-faint">Artwork</p>
                              {item.asset?.url ? (
                                <a href={item.asset.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex font-semibold text-admin-ink underline">
                                  Open file
                                </a>
                              ) : (
                                <p className="mt-1 font-semibold text-admin-ink">No file</p>
                              )}
                            </div>
                          </div>

                          {item.asset ? (
                            <div className="mt-5 rounded-xl bg-admin-canvas p-4 text-sm">
                              <p className="font-semibold text-admin-ink">{item.asset.fileName}</p>
                              <p className="mt-1 text-admin-muted">{item.asset.mimeType ?? "Unknown file type"}</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No items found" />
                )}
              </div>
            </Card>

            {printLayers.length > 1 ? (
              <Card title="Print artworks" subtitle="Every artwork on this order, with its placement and position as approved at checkout.">
                <div className="grid gap-4 sm:grid-cols-2">
                  {printLayers.map((layer) => {
                    const asset = printLayerAssetById.get(layer.assetId);
                    return (
                      <div key={layer.placement} className="flex gap-4 rounded-2xl border border-admin-border p-4 text-sm">
                        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-admin-canvas text-xs text-admin-faint">
                          {asset?.url ? (
                            <img src={asset.url} alt={asset.fileName} className="h-full w-full rounded-xl object-contain" />
                          ) : (
                            "No file"
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-admin-ink">{placementLabel(layer.placement)}</p>
                          <p className="mt-1 truncate text-admin-muted">{asset?.fileName ?? layer.assetId}</p>
                          <p className="mt-2 text-xs text-admin-faint">
                            Offset x {layer.x.toFixed(3)}, y {layer.y.toFixed(3)} · scale {layer.scale.toFixed(2)} · rotation {layer.rotation.toFixed(1)}°
                          </p>
                          {asset?.url ? (
                            <a href={asset.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-admin-ink underline">
                              Open file
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : null}

            {mockupCards.length ? (
              <Card title="Mockups">
                <div className="grid gap-4 sm:grid-cols-2">
                  {mockupCards.map((card) => (
                    <div key={card.id} className="overflow-hidden rounded-2xl border border-admin-border">
                      <a href={`/api/mockups/${card.id}/file`} target="_blank" rel="noreferrer" className="flex h-56 items-center justify-center bg-admin-canvas">
                        <img src={`/api/mockups/${card.id}/file`} alt={card.title} className="h-full w-full object-contain" />
                      </a>
                      <div className="p-4 text-xs">
                        <p className="font-semibold text-admin-ink">{card.title}</p>
                        <p className="mt-1 text-admin-faint">{card.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card title="Order timeline" subtitle="Manual admin actions recorded against this order.">
              <div className="space-y-3">
                {order.auditLogs.map((log) => (
                  <div key={log.id} className="flex flex-col justify-between gap-2 rounded-xl border border-admin-border p-4 text-sm sm:flex-row sm:items-center">
                    <div>
                      <p className="font-semibold text-admin-ink">{log.action.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-xs text-admin-faint">{log.previousValue && log.newValue ? `${log.previousValue} → ${log.newValue}` : "Recorded admin action"}</p>
                    </div>
                    <p className="text-xs text-admin-faint">{log.admin?.email ?? "Admin"} · {formatDateTime(log.createdAt)}</p>
                  </div>
                ))}
                {!order.auditLogs.length ? <EmptyState title="No manual changes recorded" /> : null}
              </div>
            </Card>

            <Card title="Administrative actions" subtitle="Internal notes are visible to admins only.">
              <form action={addAdminNoteAction} className="space-y-4">
                <input type="hidden" name="id" value={order.id} />
                <textarea
                  name="body"
                  required
                  placeholder="Add an internal note for the team..."
                  className="min-h-28 w-full rounded-2xl border border-admin-border-strong bg-white p-4 text-sm outline-none focus:border-admin-ink"
                />
                <button type="submit" className={buttonClass()}>Add note</button>
              </form>

              <div className="mt-6 space-y-3">
                {order.notes.length > 0 ? (
                  order.notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-admin-border p-4">
                      <p className="text-sm leading-6 text-admin-muted">{note.body}</p>
                      <p className="mt-3 text-xs text-admin-faint">{note.author?.email ?? "Admin"} · {formatDateTime(note.createdAt)}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No internal notes yet" />
                )}
              </div>

              {order.buildId ? (
                <Link href={`/studio/projects/${order.buildId}/builder`} className={buttonClass({ variant: "outline", className: "mt-6 w-full" })}>
                  Open related build
                </Link>
              ) : null}
            </Card>
          </section>

          <aside className="space-y-6">
            <Card title="Customer info">
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-admin-faint">Name</p>
                  <p className="mt-1 font-semibold text-admin-ink">{order.customerName ?? "No name"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-admin-faint">Email</p>
                  <p className="mt-1 font-semibold text-admin-ink">{order.customerEmail ?? order.user?.email ?? "No email"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-admin-faint">Phone</p>
                  <p className="mt-1 font-semibold text-admin-ink">{order.customerPhone ?? order.user?.phone ?? "No phone"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-admin-faint">Delivery address</p>
                  {formatShippingAddress(order).length ? (
                    <p className="mt-1 font-semibold text-admin-ink">
                      {formatShippingAddress(order).map((line) => (
                        <span key={line} className="block">{line}</span>
                      ))}
                    </p>
                  ) : (
                    <p className="mt-1 font-semibold text-admin-ink">No address</p>
                  )}
                </div>
              </div>
            </Card>

            <Card title="Pricing breakdown">
              <div className="space-y-3 text-sm">
                {isNewOrder ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-admin-faint">Canonical order total</span>
                      <span className="text-lg font-semibold text-admin-ink">{money(order.canonicalTotalUsdCents as number, "USD")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-admin-faint">Payment amount</span>
                      <span className="font-medium text-admin-ink">{money(order.totalCents, order.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-admin-faint">Payment currency</span>
                      <span className="font-medium text-admin-ink">{order.currency}</span>
                    </div>
                    {order.exchangeRateUsed != null ? (
                      <div className="flex justify-between">
                        <span className="text-admin-faint">Exchange rate</span>
                        <span className="font-medium text-admin-ink">1 USD = {formatExchangeRate(order.exchangeRateUsed)} {order.currency}</span>
                      </div>
                    ) : null}
                    {order.exchangeRateAt != null ? (
                      <div className="flex justify-between">
                        <span className="text-admin-faint">Rate applied</span>
                        <span className="font-medium text-admin-ink">{formatDateTime(order.exchangeRateAt)}</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-admin-faint">Payment amount</span>
                      <span className="text-lg font-semibold text-admin-ink">{money(order.totalCents, order.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-admin-faint">Payment currency</span>
                      <span className="font-medium text-admin-ink">{order.currency}</span>
                    </div>
                    <p className="pt-1 text-xs text-admin-faint">Canonical USD pricing was not recorded for this order.</p>
                  </>
                )}

                <div className="border-t border-admin-border pt-3">
                  <div className="flex justify-between">
                    <span className="text-admin-faint">Subtotal</span>
                    <span className="font-medium text-admin-ink">{money(breakdown.subtotalCents, order.currency)}</span>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span className="text-admin-faint">Tax + shipping</span>
                    <span className="font-medium text-admin-ink">{money(breakdown.surchargeCents, order.currency)}</span>
                  </div>
                  {usdSurcharges.taxUsdCents != null || usdSurcharges.shippingUsdCents != null ? (
                    <p className="mt-2 text-xs text-admin-faint">
                      Recorded at checkout (canonical USD): tax{" "}
                      {usdSurcharges.taxUsdCents != null ? money(usdSurcharges.taxUsdCents, "USD") : "not recorded"},
                      shipping{" "}
                      {usdSurcharges.shippingUsdCents != null
                        ? money(usdSurcharges.shippingUsdCents, "USD")
                        : "not recorded"}
                      .
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-admin-faint">
                      Tax and shipping were not recorded separately for this order.
                    </p>
                  )}
                </div>

                <div className="border-t border-admin-border pt-3">
                  <div className="flex justify-between">
                    <span className="font-semibold text-admin-ink">Total</span>
                    <span className="text-xl font-semibold text-admin-ink">{money(breakdown.totalCents, order.currency)}</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Payment information">
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-admin-faint">Payment status</p>
                  <div className="mt-1"><Badge tone={paymentStatusTone(order.paymentStatus)}>{order.paymentStatus}</Badge></div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-admin-faint">Paymob intention</p>
                  <p className="mt-1 break-all font-semibold text-admin-ink">{order.paymobIntentionId ?? "Not available"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-admin-faint">Paymob order</p>
                  <p className="mt-1 break-all font-semibold text-admin-ink">{order.paymobOrderId ?? "Not available"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-admin-faint">Transaction</p>
                  <p className="mt-1 break-all font-semibold text-admin-ink">{order.paymobTransactionId ?? "Not available"}</p>
                </div>
              </div>
            </Card>

            <Card title="Fulfillment status" subtitle="Paymob's verified webhook is the only path from NEW to PAID. Admins can manage fulfillment or cancel an order.">
              {nextStatuses.length > 0 ? (
                <div className="space-y-3">
                  {nextStatuses.map((nextStatus) => (
                    <form key={nextStatus} action={updateOrderStatusAction}>
                      <input type="hidden" name="id" value={order.id} />
                      <input type="hidden" name="status" value={nextStatus} />
                      {nextStatus === OrderStatus.CANCELLED ? (
                        <ConfirmSubmitButton
                          variant="outline"
                          className="w-full"
                          confirmMessage={`Cancel order ${order.orderNumber}? This cannot be undone from here.`}
                        >
                          Move to {ORDER_STATUS_LABELS[nextStatus]}
                        </ConfirmSubmitButton>
                      ) : (
                        <button type="submit" className={buttonClass({ variant: "outline", className: "w-full" })}>
                          Move to {ORDER_STATUS_LABELS[nextStatus]}
                        </button>
                      )}
                    </form>
                  ))}
                </div>
              ) : (
                <EmptyState title="No further status changes available" />
              )}
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
