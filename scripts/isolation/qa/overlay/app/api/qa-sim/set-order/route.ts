// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Simulates an admin changing the status of the
// signed-in customer's own order (e.g. cancelling it) so reuse / payability rules can be exercised. Not an admin API.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";

export const dynamic = "force-dynamic";
const STATUSES = ["NEW", "PAID", "IN_PRODUCTION", "SHIPPED", "COMPLETED", "CANCELLED"];
const PAYMENTS = ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"];

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { orderId?: string; status?: string; paymentStatus?: string };
  const order = body.orderId ? await prisma.order.findFirst({ where: { id: body.orderId, userId } }) : null;
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if ((body.status && !STATUSES.includes(body.status)) || (body.paymentStatus && !PAYMENTS.includes(body.paymentStatus))) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.paymentStatus) data.paymentStatus = body.paymentStatus;
  await prisma.order.update({ where: { id: order.id }, data });
  return NextResponse.json({ ok: true });
}
