import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { OrderStatus, PaymentStatus } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const orderId = body?.orderId || body?.merchant_order_id;
    const success = body?.success === true || body?.success === "true";
    const transactionId = body?.transaction_id || body?.id;

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (success) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.PAID,
          paymobTransactionId: String(transactionId || Date.now()),
        },
      });

      return NextResponse.json({ ok: true, status: "paid" });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PaymentStatus.FAILED,
      },
    });

    return NextResponse.json({ ok: true, status: "failed" });
  } catch (e) {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
