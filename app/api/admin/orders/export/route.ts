import { PaymentStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { getAdminUser } from "src/lib/admin/auth";

function csv(value: unknown) {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export async function GET(req: Request) {
  // Authoritative, DB-backed check (role + blockedAt re-verified against
  // the database on every request) -- not the stale JWT `role` claim alone,
  // so a demoted or blocked admin can't keep exporting customer PII on an
  // unexpired session. See getAdminUser's own comment in src/lib/admin/auth.ts.
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const filter = (url.searchParams.get("status") ?? "all").toLowerCase();
  const status = filter === "pending" ? { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] } : ["paid", "failed", "refunded"].includes(filter) ? { equals: filter.toUpperCase() as PaymentStatus } : undefined;
  const where: Prisma.OrderWhereInput = {
    ...(status ? { paymentStatus: status } : {}),
    ...(q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }, { customerPhone: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { items: true },
    take: 5000,
  });
  const rows = [
    ["Order ID", "Order number", "Created", "Customer", "Email", "Phone", "Items", "Currency", "Total", "Payment status", "Payment method", "Transaction ID", "Order status"],
    ...orders.map((order) => [order.id, order.orderNumber, order.createdAt.toISOString(), order.customerName, order.customerEmail, order.customerPhone, order.items.reduce((sum, item) => sum + item.quantity, 0), order.currency, (order.totalCents / 100).toFixed(2), order.paymentStatus, order.paymentMethod, order.paymobTransactionId, order.status]),
  ];
  const content = rows.map((row) => row.map(csv).join(",")).join("\r\n");
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
