// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes, never part of the application).
// Simulates the database effect of a successful payment so the paid-order paths (bag clearing, "Confirmed" wording)
// can be tested without Paymob. It is NOT the Paymob webhook: no signature, no provider, no e-mail.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { removePaidBagItem } from "src/lib/bag-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  const order = orderId ? await prisma.order.findFirst({ where: { id: orderId, userId } }) : null;
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID", status: "PAID", paidAt: new Date() } });
  await removePaidBagItem(order.id);
  const bagCount = await prisma.bagItem.count({ where: { userId } });
  return NextResponse.json({ ok: true, bagCount });
}
