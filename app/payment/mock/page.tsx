import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { buildStandardOrderEmail } from "src/lib/emails/order-emails";

type MockPaymentPageProps = {
  searchParams: Promise<{
    orderId?: string;
    result?: "success" | "failure";
  }>;
};

function money(cents: number): string {
  return `${(cents / 100).toFixed(2)} EGP`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function MockPaymentPage({
  searchParams,
}: MockPaymentPageProps) {
  const params = await searchParams;

  if (!params.orderId) {
    return (
      <main className="min-h-screen bg-[#faf8f6] p-10 text-black">
        <h1 className="text-2xl font-semibold">Missing order ID</h1>
      </main>
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: {
      items: true,
    },
  });

  if (!order) {
    return (
      <main className="min-h-screen bg-[#faf8f6] p-10 text-black">
        <h1 className="text-2xl font-semibold">Order not found</h1>
      </main>
    );
  }

  if (params.result === "success") {
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        paymobTransactionId: `mock_tx_${Date.now()}`,
      },
      include: {
        items: true,
      },
    });

    const confirmationEmail = buildStandardOrderEmail({
      firstName: updatedOrder.customerName?.split(" ")[0] ?? "there",
      orderNumber: updatedOrder.orderNumber,
      placedOn: formatDate(updatedOrder.createdAt),
      items: updatedOrder.items.map((item) => ({
        name: "Custom T-Shirt",
        quantity: item.quantity,
        details: `${item.product}, Colour: ${item.color}`,
        priceText: money(item.unitPriceCents),
      })),
      subtotalText: money(updatedOrder.subtotalCents),
      shippingText: "TBC",
      totalText: money(updatedOrder.totalCents),
      shippingTo: {
        fullName: updatedOrder.customerName ?? "Customer Name",
        addressLine1: "Address to be confirmed",
        city: "City to be confirmed",
        country: "Country to be confirmed",
      },
    });

    console.log("STANDARD ORDER CONFIRMATION EMAIL:");
    console.log(confirmationEmail);

    redirect(`/orders/${order.id}/success`);
  }

  if (params.result === "failure") {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: PaymentStatus.FAILED,
      },
    });

    redirect(`/orders/${order.id}/failed`);
  }

  return (
    <main className="min-h-screen bg-[#faf8f6] px-4 py-10 text-black">
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow">
        <p className="text-sm text-black/50">Mock Paymob Checkout</p>

        <h1 className="mt-1 text-3xl font-semibold">{order.orderNumber}</h1>

        <p className="mt-4 text-2xl font-semibold text-[#a56a2a]">
          {money(order.totalCents)}
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            href={`/payment/mock?orderId=${order.id}&result=success`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-sm font-semibold text-white"
          >
            Pay Successfully
          </Link>

          <Link
            href={`/payment/mock?orderId=${order.id}&result=failure`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-black px-5 text-sm font-semibold text-black"
          >
            Fail Payment
          </Link>
        </div>
      </div>
    </main>
  );
}