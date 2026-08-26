import { OrderStatus, PaymentAttemptStatus, PaymentStatus } from "@prisma/client";
import type { BadgeTone } from "src/components/admin/ui/Badge";

export function paymentStatusTone(status: PaymentStatus): BadgeTone {
  if (status === PaymentStatus.PAID) return "success";
  if (status === PaymentStatus.FAILED) return "danger";
  if (status === PaymentStatus.REFUNDED) return "info";
  return "warning";
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "Pending",
  PAID: "Paid",
  IN_PRODUCTION: "Processing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function orderStatusTone(status: OrderStatus): BadgeTone {
  if (status === OrderStatus.PAID) return "success";
  if (status === OrderStatus.IN_PRODUCTION) return "info";
  if (status === OrderStatus.COMPLETED) return "dark";
  if (status === OrderStatus.CANCELLED) return "danger";
  return "warning";
}

export function attemptStatusTone(status: PaymentAttemptStatus): BadgeTone {
  if (status === PaymentAttemptStatus.SUCCEEDED) return "success";
  if (status === PaymentAttemptStatus.FAILED) return "danger";
  return "warning";
}
