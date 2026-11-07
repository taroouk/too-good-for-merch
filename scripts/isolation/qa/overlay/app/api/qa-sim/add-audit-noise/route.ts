// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). Adds N unrelated audit entries to an order of the fake
// database, so tests can push an older audit entry out of any "latest N entries" list. Guarded by TGFM_FAKE_QA.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { orderId, count } = (await req.json().catch(() => ({}))) as { orderId?: string; count?: number };
  const order = orderId ? await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } }) : null;
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const n = Math.min(Math.max(Number(count) || 0, 0), 200);
  for (let i = 0; i < n; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2)); // distinct timestamps: "newest first" must be well defined
    await prisma.adminAuditLog.create({ data: { orderId: order.id, action: "QA_NOISE", newValue: String(i) } });
  }
  return NextResponse.json({ ok: true, added: n });
}
