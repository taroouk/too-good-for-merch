import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import {
  addAdminNoteAction,
  updateOrderStatusAction,
} from "src/actions/admin-order-actions";

type AdminOrderDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const allowedStatusFlow: Record<OrderStatus, OrderStatus[]> = {
  NEW: [OrderStatus.PAID, OrderStatus.CANCELLED],
  PAID: [OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
  IN_PRODUCTION: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
}: AdminOrderDetailsPageProps) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          email: true,
          phone: true,
        },
      },
      build: true,
      items: {
        include: {
          asset: true,
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
    },
  });

  if (!order) {
    notFound();
  }

  const nextStatuses = allowedStatusFlow[order.status];

  return (
    <main className="px-4 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <Link
            href="/admin/orders"
            className="text-sm font-semibold text-black/60 hover:text-black"
          >
            ← Back to orders
          </Link>
        </div>

        <div className="mb-8 rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm text-black/50">
                Created {formatDateTime(order.createdAt)}
              </p>

              <h1 className="mt-1 text-3xl font-semibold">
                {order.orderNumber}
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-black/60">
                Manage this order’s production workflow, payment state,
                customer details, artwork, items, and internal notes.
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

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <section className="space-y-6">
            <div className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Order items</h2>

              <div className="mt-5 space-y-4">
                {order.items.length > 0 ? (
                  order.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-3xl border border-black/10 p-5"
                    >
                      <div className="flex flex-col gap-5 sm:flex-row">
                        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-3xl bg-[#faf8f6] text-xs text-black/40">
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

                          <div className="mt-5 grid gap-4 text-sm sm:grid-cols-4">
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
                                {placementsText(item.placements)}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-wide text-black/40">
                                Artwork
                              </p>

                              {item.asset?.url ? (
                                <a
                                  href={item.asset.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-flex font-semibold text-[#a56a2a] underline"
                                >
                                  Open file
                                </a>
                              ) : (
                                <p className="mt-1 font-semibold">No file</p>
                              )}
                            </div>
                          </div>

                          {item.asset ? (
                            <div className="mt-5 rounded-2xl bg-[#faf8f6] p-4 text-sm">
                              <p className="font-semibold">
                                {item.asset.fileName}
                              </p>
                              <p className="mt-1 text-black/50">
                                {item.asset.mimeType ?? "Unknown file type"}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-black/50">No items found.</p>
                )}
              </div>
            </div>

            <div className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Internal admin notes</h2>

              <form action={addAdminNoteAction} className="mt-5 space-y-4">
                <input type="hidden" name="id" value={order.id} />

                <textarea
                  name="body"
                  required
                  placeholder="Add an internal note for the team..."
                  className="min-h-28 w-full rounded-2xl border border-black/10 bg-white p-4 text-sm outline-none focus:border-black"
                />

                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Add note
                </button>
              </form>

              <div className="mt-6 space-y-3">
                {order.notes.length > 0 ? (
                  order.notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-2xl border border-black/10 p-4"
                    >
                      <p className="text-sm leading-6 text-black/70">
                        {note.body}
                      </p>

                      <p className="mt-3 text-xs text-black/40">
                        {note.author?.email ?? "Admin"} ·{" "}
                        {formatDateTime(note.createdAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-black/50">
                    No internal notes yet.
                  </p>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Customer info</h2>

              <div className="mt-5 space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-black/40">
                    Name
                  </p>
                  <p className="mt-1 font-semibold">
                    {order.customerName ?? "No name"}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-black/40">
                    Email
                  </p>
                  <p className="mt-1 font-semibold">
                    {order.customerEmail ?? order.user?.email ?? "No email"}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-black/40">
                    Phone
                  </p>
                  <p className="mt-1 font-semibold">
                    {order.customerPhone ?? order.user?.phone ?? "No phone"}
                  </p>
                </div>
              </div>
            </div>

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

                <div className="pt-2 text-xs text-black/40">Currency: USD</div>
              </div>
            </div>

            <div className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Change order status</h2>

              <p className="mt-2 text-sm leading-6 text-black/60">
                Allowed workflow: NEW → PAID → IN_PRODUCTION → COMPLETED.
                Cancel is available before completion.
              </p>

              {nextStatuses.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {nextStatuses.map((nextStatus) => (
                    <form key={nextStatus} action={updateOrderStatusAction}>
                      <input type="hidden" name="id" value={order.id} />
                      <input type="hidden" name="status" value={nextStatus} />

                      <button
                        type="submit"
                        className="h-11 w-full rounded-xl border border-black px-4 text-sm font-semibold text-black hover:bg-black hover:text-white"
                      >
                        Move to {statusLabel(nextStatus)}
                      </button>
                    </form>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-2xl bg-[#faf8f6] p-4 text-sm text-black/50">
                  No further status changes available.
                </p>
              )}
            </div>

            <div className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Payment details</h2>

              <div className="mt-5 space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-black/40">
                    Payment status
                  </p>
                  <p className="mt-1 font-semibold">{order.paymentStatus}</p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-black/40">
                    Paymob intention
                  </p>
                  <p className="mt-1 break-all font-semibold">
                    {order.paymobIntentionId ?? "Not available"}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-black/40">
                    Paymob order
                  </p>
                  <p className="mt-1 break-all font-semibold">
                    {order.paymobOrderId ?? "Not available"}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-black/40">
                    Transaction
                  </p>
                  <p className="mt-1 break-all font-semibold">
                    {order.paymobTransactionId ?? "Not available"}
                  </p>
                </div>
              </div>
            </div>

            {order.buildId ? (
              <Link
                href={`/studio/projects/${order.buildId}/builder`}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-black px-6 text-sm font-semibold text-black hover:bg-black hover:text-white"
              >
                Open related build
              </Link>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}