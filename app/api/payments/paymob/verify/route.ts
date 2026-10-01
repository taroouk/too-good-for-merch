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

// Paymob's response callback lands here. Card payments are now embedded
// in an <iframe> on /checkout, so this response usually renders INSIDE that
// frame -- a plain 302 would load the order page within the small payment
// box. Instead, navigate the top-level window (a no-op difference when the
// callback arrives un-framed, e.g. wallet redirects). next.config.ts allows
// this one path to be framed by our own origin.
function topLevelRedirect(destination: string) {
  const target = JSON.stringify(destination);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting…</title></head><body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;color:#555"><p><a href=${target} target="_top">Continue</a></p><script>(window.top||window).location.replace(${target});</script></body></html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
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
  if (!order) return topLevelRedirect("/orders");

  const destination =
    order.paymentStatus === PaymentStatus.PAID
      ? `/orders/${order.id}/success`
      : order.paymentStatus === PaymentStatus.FAILED
        ? `/orders/${order.id}/failed`
        : `/orders/${order.id}`;
  return topLevelRedirect(destination);
}
