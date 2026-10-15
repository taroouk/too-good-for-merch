// Pure, DB-free helpers for the customer-facing "My orders" pages: a plain
// status the customer understands, the progress timeline, list filters and
// the item money shown in the currency they were actually charged in.

export type OrderLike = {
  status: string; // OrderStatus
  paymentStatus: string; // PaymentStatus
  createdAt: Date;
  paidAt: Date | null;
  shippedAt: Date | null;
  refundedAt: Date | null;
};

export type StatusTone = "neutral" | "warning" | "info" | "success" | "danger";

export type CustomerStatus = {
  key: "awaiting-payment" | "payment-failed" | "confirmed" | "in-production" | "shipped" | "delivered" | "cancelled" | "refunded";
  label: string;
  tone: StatusTone;
  description: string;
};

export function customerOrderStatus(order: OrderLike): CustomerStatus {
  if (order.paymentStatus === "REFUNDED" || order.refundedAt) {
    return { key: "refunded", label: "Refunded", tone: "neutral", description: "This order was refunded." };
  }
  if (order.status === "CANCELLED") {
    return { key: "cancelled", label: "Cancelled", tone: "danger", description: "This order was cancelled." };
  }
  if (order.paymentStatus === "FAILED") {
    return { key: "payment-failed", label: "Payment failed", tone: "danger", description: "Your payment didn't go through. You can try again." };
  }
  if (order.paymentStatus !== "PAID") {
    return { key: "awaiting-payment", label: "Awaiting payment", tone: "warning", description: "We'll start on your order as soon as payment is confirmed." };
  }
  if (order.status === "COMPLETED") {
    return { key: "delivered", label: "Delivered", tone: "success", description: "Your order has been delivered." };
  }
  if (order.status === "SHIPPED" || order.shippedAt) {
    return { key: "shipped", label: "Shipped", tone: "info", description: "Your order is on its way." };
  }
  if (order.status === "IN_PRODUCTION") {
    return { key: "in-production", label: "In production", tone: "info", description: "Your order is being printed and prepared." };
  }
  return { key: "confirmed", label: "Confirmed", tone: "success", description: "Payment received — your order is confirmed." };
}

export type TimelineStep = { key: string; label: string; at: Date | null; state: "done" | "current" | "upcoming" };

// Placed -> Paid -> In production -> Shipped -> Delivered. Cancelled/refunded
// orders have no forward timeline (the status banner explains instead).
export function orderTimeline(order: OrderLike): TimelineStep[] | null {
  const status = customerOrderStatus(order);
  if (status.key === "cancelled" || status.key === "refunded") return null;

  const paid = order.paymentStatus === "PAID";
  const reached = {
    placed: true,
    paid,
    production: paid && (order.status === "IN_PRODUCTION" || order.status === "SHIPPED" || order.status === "COMPLETED" || Boolean(order.shippedAt)),
    shipped: paid && (order.status === "SHIPPED" || order.status === "COMPLETED" || Boolean(order.shippedAt)),
    delivered: paid && order.status === "COMPLETED",
  };
  const steps: Array<{ key: string; label: string; at: Date | null; done: boolean }> = [
    { key: "placed", label: "Order placed", at: order.createdAt, done: reached.placed },
    { key: "paid", label: "Payment confirmed", at: order.paidAt, done: reached.paid },
    { key: "production", label: "In production", at: null, done: reached.production },
    { key: "shipped", label: "Shipped", at: order.shippedAt, done: reached.shipped },
    { key: "delivered", label: "Delivered", at: null, done: reached.delivered },
  ];
  const firstOpen = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({
    key: step.key,
    label: step.label,
    at: step.done ? step.at : null,
    state: step.done ? "done" : index === firstOpen ? "current" : "upcoming",
  }));
}

export type OrderFilter = "all" | "active" | "unpaid" | "delivered" | "closed";

export const ORDER_FILTERS: Array<{ key: OrderFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "unpaid", label: "Awaiting payment" },
  { key: "delivered", label: "Delivered" },
  { key: "closed", label: "Cancelled / refunded" },
];

export function parseOrderFilter(value: unknown): OrderFilter {
  return ORDER_FILTERS.some((filter) => filter.key === value) ? (value as OrderFilter) : "all";
}

export function matchesOrderFilter(order: OrderLike, filter: OrderFilter): boolean {
  if (filter === "all") return true;
  const key = customerOrderStatus(order).key;
  switch (filter) {
    case "active":
      return key === "confirmed" || key === "in-production" || key === "shipped";
    case "unpaid":
      return key === "awaiting-payment" || key === "payment-failed";
    case "delivered":
      return key === "delivered";
    case "closed":
      return key === "cancelled" || key === "refunded";
  }
}

// Item prices are stored canonical USD on the current pricing model, while the
// customer was charged in the payment currency. Convert each line at the
// rate the order was placed with and put the rounding remainder on the last
// line so the lines always add up to Order.subtotalCents.
export function itemAmountsInChargedCurrency(
  items: Array<{ quantity: number; unitPriceCents: number; totalCents: number }>,
  order: { subtotalCents: number; canonicalTotalUsdCents: number | null; exchangeRateUsed: number | null },
): Array<{ unitCents: number; totalCents: number }> {
  const rate = order.exchangeRateUsed;
  const converted = order.canonicalTotalUsdCents != null && typeof rate === "number" && rate > 0;
  if (!converted) return items.map((item) => ({ unitCents: item.unitPriceCents, totalCents: item.totalCents }));

  const totals = items.map((item) => Math.round(item.totalCents * rate));
  const drift = order.subtotalCents - totals.reduce((sum, value) => sum + value, 0);
  if (totals.length && drift !== 0 && Math.abs(drift) <= items.length + 1) totals[totals.length - 1] += drift;
  return items.map((item, index) => ({
    unitCents: item.quantity > 0 ? Math.round(totals[index] / item.quantity) : Math.round(item.unitPriceCents * rate),
    totalCents: totals[index],
  }));
}

export function paymentMethodLabel(method: string | null | undefined): string {
  if (method === "CARD") return "Card";
  if (method === "WALLET") return "Mobile wallet";
  return "Online payment";
}
