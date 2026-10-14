import { prisma } from "src/lib/prisma";

// Once an order for a build is PAID it no longer belongs in the customer's
// bag (it would otherwise sit there inviting a second checkout and inflating
// the header's item count). Called from every place an order becomes PAID
// (Paymob webhook, admin mark-as-paid). Never throws: a bag cleanup problem
// must not fail a payment.
export async function removePaidBagItem(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true, buildId: true, paymentStatus: true },
    });
    if (!order?.userId || !order.buildId || order.paymentStatus !== "PAID") return;
    await prisma.bagItem.deleteMany({ where: { userId: order.userId, buildId: order.buildId } });
  } catch (error) {
    console.error("[bag] could not clear a paid item", error);
  }
}
