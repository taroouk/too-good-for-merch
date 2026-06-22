"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PaymentStatusClient({
  orderId,
  initialStatus,
  retryEnabled,
}: {
  orderId: string;
  initialStatus: string;
  retryEnabled: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "PAID" || status === "REFUNDED" || status === "FAILED") return;
    let stopped = false;
    const poll = async () => {
      const response = await fetch(`/api/payments/paymob/verify?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      if (!response.ok || stopped) return;
      const data = await response.json();
      setStatus(data.paymentStatus);
      if (data.paymentStatus === "PAID") router.replace(`/orders/${orderId}/success`);
      if (data.paymentStatus === "FAILED") router.refresh();
    };
    void poll();
    const timer = window.setInterval(poll, 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [orderId, router, status]);

  async function retry() {
    setRetrying(true);
    setError(null);
    const response = await fetch("/api/payments/paymob/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, method: "CARD" }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.paymentUrl) window.location.assign(data.paymentUrl);
    else {
      setError(data?.error ?? "Could not create a new payment link.");
      setRetrying(false);
    }
  }

  const copy = status === "PAID"
    ? ["Payment confirmed", "Your order is paid and ready for production.", "bg-emerald-50 text-emerald-800"]
    : status === "FAILED"
      ? ["Payment failed", "Paymob could not complete this payment. Your order is still safe.", "bg-red-50 text-red-800"]
      : status === "REFUNDED"
        ? ["Payment refunded", "This payment has been refunded.", "bg-blue-50 text-blue-800"]
        : ["Waiting for confirmation", "We are waiting for Paymob’s secure webhook. This page updates automatically.", "bg-amber-50 text-amber-800"];

  return (
    <div className="mt-6">
      <div className={`rounded-2xl p-5 ${copy[2]}`}>
        <div className="flex items-center gap-3">
          {status === "PENDING" || status === "UNPAID" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
          <strong>{copy[0]}</strong>
        </div>
        <p className="mt-2 text-sm opacity-80">{copy[1]}</p>
      </div>
      {retryEnabled && (status === "FAILED" || status === "UNPAID") ? (
        <button onClick={retry} disabled={retrying} className="mt-4 h-12 w-full rounded-xl bg-black font-semibold text-white disabled:opacity-50">
          {retrying ? "Creating secure link…" : "Try card payment again"}
        </button>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
