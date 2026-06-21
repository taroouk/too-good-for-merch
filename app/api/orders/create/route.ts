import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { OrderStatus, PaymentStatus } from "@prisma/client";

export async function POST(req: Request) {
  const body = await req.json();

  const order = await prisma.order.create({
    data: {
      orderNumber: `TGFM-${Date.now()}`,
      status: OrderStatus.NEW,
      paymentStatus: PaymentStatus.UNPAID,
      currency: body.currency,
      subtotalCents: Math.round(body.total * 100),
      totalCents: Math.round(body.total * 100),
      buildId: body.buildId,
      items: {
        create: {
          product: body.product,
          fabric: body.fabric,
          color: body.color,
          quantity: body.quantity,
          unitPriceCents: Math.round(body.unitPrice * 100),
          totalCents: Math.round(body.total * 100),
          placements: body.placements,
          assetId: body.assetId ?? null,
        },
      },
    },
  });

  return NextResponse.json({
    orderId: order.id,
  });
}