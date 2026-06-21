import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
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

    // 🔥 FIX 1: amount MUST be integer in EGP (NOT cents)
    const amount = Math.round(order.totalCents / 100);

    const response = await fetch(
      "https://accept.paymob.com/v1/intention/",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          currency: "EGP", // 🔥 FORCE EGP
          payment_methods: [integrationId],

          items: order.items.map((item) => ({
            name: item.product || "Custom Product",
            amount: Math.round(item.totalCents / 100),
            quantity: item.quantity,
          })),

          billing_data: {
            first_name: "Customer",
            last_name: "User",
            email: "test@test.com",
            phone_number: "01000000000",
          },
        }),
      }
    );

    const data = await response.json();

    console.log("🔥 PAYMOB RESPONSE:", data);

    // ❌ HARD CHECK
    if (!data.client_secret) {
      return NextResponse.json(
        {
          error: "Paymob failed",
          details: data,
        },
        { status: 500 }
      );
    }

    const paymentUrl =
      `https://accept.paymob.com/unifiedcheckout/?` +
      `publicKey=${publicKey}&clientSecret=${data.client_secret}`;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymobIntentionId: data.id,
        paymentUrl,
        paymentStatus: "PENDING",
      },
    });

    return NextResponse.json({ paymentUrl });
  } catch (err) {
    return NextResponse.json(
      { error: "Server error", details: err },
      { status: 500 }
    );
  }
}