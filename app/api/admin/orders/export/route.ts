import { PaymentStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { getAdminUser } from "src/lib/admin/auth";
import { formatShippingAddress, orderItemExtras } from "src/lib/orders/display";

const EXPORT_LIMIT = 5000;

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
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const createdAt: Prisma.DateTimeFilter | undefined = isDate(from) || isDate(to)
    ? {
        ...(isDate(from) ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(isDate(to) ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      }
    : undefined;
  const minRaw = url.searchParams.get("minTotal") ?? "";
  const maxRaw = url.searchParams.get("maxTotal") ?? "";
  const minCents = Number(minRaw);
  const maxCents = Number(maxRaw);
  const totalCents: Prisma.IntFilter | undefined = minRaw || maxRaw
    ? {
        ...(minRaw && Number.isFinite(minCents) ? { gte: Math.round(minCents * 100) } : {}),
        ...(maxRaw && Number.isFinite(maxCents) ? { lte: Math.round(maxCents * 100) } : {}),
      }
    : undefined;
  const where: Prisma.OrderWhereInput = {
    ...(status ? { paymentStatus: status } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(totalCents ? { totalCents } : {}),
    ...(q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }, { customerPhone: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { items: true },
    take: EXPORT_LIMIT + 1,
  });
  const truncated = orders.length > EXPORT_LIMIT;
  if (truncated) orders.pop();
  const rows = [
    ["Order ID", "Order number", "Created", "Customer", "Email", "Phone", "Delivery address", "Items", "Currency", "Total", "Payment status", "Payment method", "Transaction ID", "Order status", "Sizes", "Courier", "Tracking number", "Shipped at"],
    ...orders.map((order) => [order.id, order.orderNumber, order.createdAt.toISOString(), order.customerName, order.customerEmail, order.customerPhone, formatShippingAddress(order).join(", "), order.items.reduce((sum, item) => sum + item.quantity, 0), order.currency, (order.totalCents / 100).toFixed(2), order.paymentStatus, order.paymentMethod, order.paymobTransactionId, order.status, order.items.map((item) => `${item.quantity}x${orderItemExtras(item.preview).size ?? "?"}`).join(" "), order.carrier, order.trackingNumber, order.shippedAt?.toISOString() ?? ""]),
  ];
  const content = rows.map((row) => row.map(csv).join(",")).join("\r\n");
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
      // The CSV is capped; tell the client (and make it visible in the
      // file itself via the header) rather than silently dropping rows.
      ...(truncated ? { "X-Export-Truncated": String(EXPORT_LIMIT) } : {}),
    },
  });
}
