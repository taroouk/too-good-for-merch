import { prisma } from "src/lib/prisma";
import { notFound } from "next/navigation";

function money(cents: number) {
  return `${(cents / 100).toFixed(2)} EGP`;
}

export default async function Success({ params }: any) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: true },
  });

  if (!order) notFound();

  return (
    <main className="p-10 text-center">
      <h1 className="text-3xl font-bold text-green-600">
        Payment Successful
      </h1>

      <p className="mt-2">{order.orderNumber}</p>

      <p className="mt-4 text-xl">{money(order.totalCents)}</p>

      <a
        href={`/orders/${order.id}`}
        className="mt-6 inline-block border px-6 py-2 rounded-xl"
      >
        View Order
      </a>
    </main>
  );
}