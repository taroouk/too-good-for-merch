import { NextResponse } from "next/server";
import { prisma } from "src/lib/prisma";
import { PaymentStatus } from "@prisma/client";

export async function POST(req: Request) {
  const { orderId } = await req.json();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const secretKey = process.env.PAYMOB_SECRET_KEY!;
  const publicKey = process.env.PAYMOB_PUBLIC_KEY!;
  const integrationId = Number(process.env.PAYMOB_INTEGRATION_ID!);

  const response = await fetch("https://accept.paymob.com/v1/intention/", {
    method: "POST",
    headers: {
      Authorization: `Token ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: order.totalCents,
      currency: order.currency,
      payment_methods: [integrationId],
      items: order.items.map((item) => ({
        name: "T-Shirt",
        amount: item.totalCents,
        quantity: item.quantity,
      })),
      billing_data: {
        first_name: "Customer",
        last_name: "TGFM",
        email: "test@example.com",
        phone_number: "0000000000",
      },
    }),
  });

  const data = await response.json();

  const paymentUrl =
    `https://accept.paymob.com/unifiedcheckout/?` +
    `publicKey=${publicKey}&clientSecret=${data.client_secret}`;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: PaymentStatus.PENDING,
      paymobIntentionId: data.id,
      paymentUrl,
    },
  });

  return NextResponse.json({
    paymentUrl,
  });
}