import Link from "next/link";
import { PaymentAttemptStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import AdminToast from "src/components/admin/AdminToast";
import { generateRetryPaymentLinkAction } from "src/actions/admin-system-actions";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams;
  const [attempts, webhooks, total, succeeded, failed] = await Promise.all([
    prisma.paymentAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { id: true, orderNumber: true, customerName: true, paymentStatus: true, paymentFailureReason: true } } } }),
    prisma.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { order: { select: { id: true, orderNumber: true } } } }),
    prisma.paymentAttempt.count(),
    prisma.paymentAttempt.count({ where: { status: PaymentAttemptStatus.SUCCEEDED } }),
    prisma.paymentAttempt.count({ where: { status: PaymentAttemptStatus.FAILED } }),
  ]);
  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Paymob</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Payments</h1><p className="mt-2 text-sm text-black/45">Payment attempts, processor responses, and verified webhook activity.</p></div>
        <section className="mt-7 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-[#111827] p-5 text-white"><p className="text-sm text-white/50">Attempts</p><p className="mt-2 text-3xl font-semibold">{total}</p></div><div className="rounded-2xl bg-emerald-50 p-5"><p className="text-sm text-emerald-800/55">Successful</p><p className="mt-2 text-3xl font-semibold text-emerald-800">{succeeded}</p></div><div className="rounded-2xl bg-red-50 p-5"><p className="text-sm text-red-800/55">Failed</p><p className="mt-2 text-3xl font-semibold text-red-800">{failed}</p></div></section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-5 py-4"><h2 className="font-semibold">Transaction attempts</h2></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#f8f8f8] text-[11px] uppercase tracking-wider text-black/35"><tr><th className="px-5 py-4">Order</th><th className="px-5 py-4">Created</th><th className="px-5 py-4">Method</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Paymob ref</th><th className="px-5 py-4">Amount</th><th className="px-5 py-4">Reason / action</th></tr></thead><tbody className="divide-y divide-black/5">{attempts.map((attempt) => <tr key={attempt.id}><td className="px-5 py-4"><Link href={`/admin/orders/${attempt.order.id}`} className="font-semibold hover:underline">{attempt.order.orderNumber}</Link><p className="mt-1 text-xs text-black/35">{attempt.order.customerName ?? "Customer"}</p></td><td className="px-5 py-4 text-black/50">{attempt.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td><td className="px-5 py-4 text-xs font-semibold">{attempt.method}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${attempt.status === "SUCCEEDED" ? "bg-emerald-50 text-emerald-700" : attempt.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{attempt.status}</span></td><td className="max-w-[170px] truncate px-5 py-4 font-mono text-xs text-black/45">{attempt.externalId ?? "—"}</td><td className="px-5 py-4 font-semibold">{money(attempt.amountCents, attempt.currency)}</td><td className="px-5 py-4"><p className="max-w-xs text-xs text-red-600">{attempt.failureReason ?? attempt.order.paymentFailureReason ?? "—"}</p>{attempt.order.paymentStatus !== PaymentStatus.PAID && attempt.order.paymentStatus !== PaymentStatus.REFUNDED ? <form action={generateRetryPaymentLinkAction} className="mt-2"><input type="hidden" name="orderId" value={attempt.order.id}/><button className="text-xs font-semibold underline">Generate retry link</button></form> : null}</td></tr>)}</tbody></table></div>
          {!attempts.length ? <div className="p-12 text-center text-sm text-black/40">No payment attempts yet.</div> : null}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-5 py-4"><h2 className="font-semibold">Webhook log</h2><p className="mt-1 text-xs text-black/40">Invalid signatures are retained for investigation and never update orders.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#f8f8f8] text-[11px] uppercase tracking-wider text-black/35"><tr><th className="px-5 py-4">Received</th><th className="px-5 py-4">Event</th><th className="px-5 py-4">Order</th><th className="px-5 py-4">Signature</th><th className="px-5 py-4">Processed</th><th className="px-5 py-4">Transaction</th><th className="px-5 py-4">Error</th></tr></thead><tbody className="divide-y divide-black/5">{webhooks.map((event) => <tr key={event.id}><td className="px-5 py-4 text-black/50">{event.createdAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td><td className="px-5 py-4 font-semibold">{event.eventType}</td><td className="px-5 py-4">{event.order ? <Link href={`/admin/orders/${event.order.id}`} className="font-semibold hover:underline">{event.order.orderNumber}</Link> : "—"}</td><td className="px-5 py-4"><span className={event.validSignature ? "text-emerald-700" : "text-red-700"}>{event.validSignature ? "Valid" : "Rejected"}</span></td><td className="px-5 py-4">{event.processed ? "Yes" : "No"}</td><td className="px-5 py-4 font-mono text-xs text-black/45">{event.transactionId ?? "—"}</td><td className="px-5 py-4 text-xs text-red-600">{event.errorMessage ?? "—"}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </main>
  );
}
