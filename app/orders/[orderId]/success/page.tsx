import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PaymentStatus, Role } from "@prisma/client";
import { auth } from "src/auth";
import { isAdminSession } from "src/lib/admin/auth";
import { prisma } from "src/lib/prisma";
import { duplicateReviewIdsFor } from "src/lib/orders/duplicate-review-db";
import SuccessStatusWatcher from "./SuccessStatusWatcher";

export default async function SuccessPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/orders/${orderId}/success`)}`);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || (order.userId !== session.user.id && !(await isAdminSession()))) notFound();
  if (order.paymentStatus !== PaymentStatus.PAID) redirect(`/orders/${order.id}`);
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id }, select: { preview: true } });
  const underReview = (await duplicateReviewIdsFor(order.userId, [{ ...order, items }])).has(order.id);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f1ed] px-4 text-black">
      <SuccessStatusWatcher orderId={order.id} initialUnderReview={underReview} initialOrderStatus={order.status} />
      <div className="w-full max-w-lg rounded-[32px] bg-white p-9 text-center shadow-[0_24px_90px_rgba(0,0,0,.1)]">
        {underReview ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl text-amber-700">!</div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[.18em] text-black/40">Under review</p>
            <h1 className="mt-2 text-3xl font-semibold">Payment received — under review</h1>
            <p className="mt-3 text-sm leading-6 text-black/55">
              We&apos;ve received your payment for {order.orderNumber}. Because this design was also paid for on another order, our team is
              reviewing it before production starts. We&apos;ll contact you if we need anything from you.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
              ✓
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[.18em] text-black/40">Payment confirmed</p>
            <h1 className="mt-2 text-3xl font-semibold">Payment successful</h1>
            <p className="mt-3 text-sm leading-6 text-black/55">
              Your payment for {order.orderNumber} has been securely confirmed. We will begin preparing your order.
            </p>
          </>
        )}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link href={`/orders/${order.id}`} className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white">
            View order
          </Link>
          <a href="/studio" className="rounded-xl border border-black px-5 py-3 text-sm font-semibold">
            Back to Studio
          </a>
        </div>
      </div>
    </main>
  );
}
