// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Puts the build of the signed-in customer's own order back in
// their bag, so a test can check whether a later webhook wrongly clears it. Not part of the application.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  const order = orderId ? await prisma.order.findFirst({ where: { id: orderId, userId } }) : null;
  if (!order?.buildId) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const existing = await prisma.bagItem.findFirst({ where: { userId, buildId: order.buildId } });
  if (!existing) await prisma.bagItem.create({ data: { userId, buildId: order.buildId, size: "M" } });
  return NextResponse.json({ ok: true });
}
