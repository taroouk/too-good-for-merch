// ISOLATED-COPY ONLY (installed by run-isolated.mjs --qa-routes). READ-ONLY view of the signed-in customer's own orders in
// the fake database (status, consent stamp, e-mail claim, admin notes and audit entries) so the QA scripts can see effects
// that no customer page shows. Not an admin API.
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.TGFM_FAKE_QA !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { orderIds } = (await req.json().catch(() => ({}))) as { orderIds?: string[] };
  const ids = Array.isArray(orderIds) ? orderIds.filter((id) => typeof id === "string").slice(0, 50) : [];
  const orders = await prisma.order.findMany({ where: { id: { in: ids }, userId }, orderBy: { createdAt: "asc" } });
  const mine = orders.map((order) => order.id);
  const [notes, audits, attempts] = await Promise.all([
    prisma.adminNote.findMany({ where: { orderId: { in: mine } } }),
    prisma.adminAuditLog.findMany({ where: { orderId: { in: mine } } }),
    prisma.paymentAttempt.findMany({ where: { orderId: { in: mine } } }),
  ]);
  return NextResponse.json({
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalCents: order.totalCents,
      confirmationEmailSentAt: order.confirmationEmailSentAt,
      termsAcceptedAt: order.termsAcceptedAt,
      termsVersion: order.termsVersion,
      notes: notes.filter((note) => note.orderId === order.id).map((note) => note.body),
      audits: audits.filter((audit) => audit.orderId === order.id).map((audit) => audit.action),
      attempts: attempts.filter((attempt) => attempt.orderId === order.id).map((attempt) => ({ status: attempt.status, hasLink: Boolean(attempt.paymentUrl) })),
    })),
  });
}
