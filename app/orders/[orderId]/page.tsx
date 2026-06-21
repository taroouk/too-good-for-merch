import { prisma } from "src/lib/prisma";
import { notFound } from "next/navigation";

export default async function OrderPage({ params }: any) {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { items: true },
  });

  if (!order) notFound();

  return (
    <main className="p-10">
      <h1 className="text-xl font-bold">Order Detail</h1>

      <p className="mt-2">Order: {order.orderNumber}</p>

      <div className="mt-4 border p-4 rounded-xl">
        {order.items[0]?.product}
      </div>
    </main>
  );
}