import { PaymentStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

async function statusResponse(orderId: string) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      orderNumber: true,
      paymentStatus: true,
      status: true,
      totalCents: true,
      currency: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (session.user.role !== Role.ADMIN && order.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    orderStatus: order.status,
    totalCents: order.totalCents,
    currency: order.currency,
    confirmed: order.paymentStatus === PaymentStatus.PAID,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body?.orderId !== "string") {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }
  return statusResponse(body.orderId);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");
  if (orderId) return statusResponse(orderId);

  const remoteOrderId = url.searchParams.get("order") ?? url.searchParams.get("order_id");
  if (!remoteOrderId) return NextResponse.json({ error: "Order reference is required." }, { status: 400 });

  const order = await prisma.order.findFirst({
    where: { paymobOrderId: remoteOrderId },
    select: { id: true, paymentStatus: true },
  });
  if (!order) return NextResponse.redirect(new URL("/orders", url.origin));

  const destination =
    order.paymentStatus === PaymentStatus.PAID
      ? `/orders/${order.id}/success`
      : order.paymentStatus === PaymentStatus.FAILED
        ? `/orders/${order.id}/failed`
        : `/orders/${order.id}`;
  return NextResponse.redirect(new URL(destination, url.origin));
}
