import { redirect } from "next/navigation";

// This route is not part of the verified payment flow. Real payment status
// is only ever shown from /orders/[orderId], which reflects the
// server-verified PaymentStatus in the database.
export default function LegacyPaymentsFailedPage() {
  redirect("/orders");
}
