import { redirect } from "next/navigation";

// This route is not part of the verified payment flow. Real payment status
// is only ever shown from /orders/[orderId] (or /orders/[orderId]/success),
// which check the server-verified PaymentStatus in the database. This page
// must never assert success on its own — see /api/payments/paymob/webhook
// and /api/payments/paymob/verify for the actual verification logic.
export default function LegacyPaymentsSuccessPage() {
  redirect("/orders");
}
