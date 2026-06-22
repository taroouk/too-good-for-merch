import { NextResponse } from "next/server";
import { auth } from "src/auth";
import { CheckoutError, createCheckoutOrder } from "src/lib/orders/checkout";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const body = await req.json().catch(() => null);
  try {
    const order = await createCheckoutOrder(session.user.id, {
      buildId: body?.buildId,
      customer: body?.customer,
      placements: body?.placements,
      size: body?.size,
    });
    return NextResponse.json({ orderId: order.id, orderNumber: order.orderNumber, totalCents: order.totalCents });
  } catch (error) {
    const status = error instanceof CheckoutError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create order." }, { status });
  }
}
