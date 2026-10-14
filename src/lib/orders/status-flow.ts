// The single source of truth for manual order-status transitions (it used
// to be copy-pasted into the admin action AND the order page). DB-free, so
// it is unit tested.
export type OrderStatusKey = "NEW" | "PAID" | "IN_PRODUCTION" | "SHIPPED" | "COMPLETED" | "CANCELLED";

export const ORDER_STATUS_FLOW: Record<OrderStatusKey, OrderStatusKey[]> = {
  NEW: ["CANCELLED"],
  PAID: ["IN_PRODUCTION", "CANCELLED"],
  // COMPLETED straight from production covers pick-up / hand-delivered
  // orders that never get a courier tracking number.
  IN_PRODUCTION: ["SHIPPED", "COMPLETED", "CANCELLED"],
  // Once it has left the building it can only be closed out as delivered
  // (COMPLETED); cancelling a parcel in transit is a refund conversation.
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: ["NEW"],
};

export function canTransition(from: OrderStatusKey, to: OrderStatusKey): boolean {
  return ORDER_STATUS_FLOW[from]?.includes(to) ?? false;
}

// SHIPPED is entered only through the "Mark as shipped" form (it needs a
// carrier + tracking), never through a bare status button.
export function plainStatusButtons(from: OrderStatusKey): OrderStatusKey[] {
  return (ORDER_STATUS_FLOW[from] ?? []).filter((next) => next !== "SHIPPED");
}

export function canMarkShipped(from: OrderStatusKey): boolean {
  return canTransition(from, "SHIPPED");
}

export type TrackingInput = { carrier: string; trackingNumber: string; trackingUrl: string };

// Returns the cleaned values or an error message.
export function validateTracking(input: TrackingInput): { ok: true; value: { carrier: string; trackingNumber: string | null; trackingUrl: string | null } } | { ok: false; error: string } {
  const carrier = input.carrier.trim();
  const trackingNumber = input.trackingNumber.trim();
  const trackingUrl = input.trackingUrl.trim();
  if (carrier.length < 2 || carrier.length > 60) return { ok: false, error: "Enter the courier name (2–60 characters)." };
  if (trackingNumber.length > 80) return { ok: false, error: "Tracking number is too long." };
  if (trackingUrl) {
    if (trackingUrl.length > 500) return { ok: false, error: "Tracking link is too long." };
    let parsed: URL;
    try {
      parsed = new URL(trackingUrl);
    } catch {
      return { ok: false, error: "Tracking link must be a full URL starting with https://" };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false, error: "Tracking link must start with http:// or https://" };
  }
  return { ok: true, value: { carrier, trackingNumber: trackingNumber || null, trackingUrl: trackingUrl || null } };
}
