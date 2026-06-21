import { redirect } from "next/navigation";
import { PaymentStatus } from "@prisma/client";
import { prisma } from "src/lib/prisma";

type PaymobIntentionResponse = {
  id: string;
  client_secret: string;
  order?: {
    id?: number;
  };
};

function cleanFormValue(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request): Promise<void> {
  const formData = await request.formData();

  const orderId = cleanFormValue(formData.get("orderId"));
  const customerName = cleanFormValue(formData.get("customerName"));
  const customerPhone = cleanFormValue(formData.get("customerPhone"));
  const customerEmail = cleanFormValue(formData.get("customerEmail"));

  if (!orderId) {
    redirect("/studio/projects");
  }

  if (!customerPhone) {
    redirect(`/orders/${orderId}/checkout`);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
    },
  });

  if (!order) {
    redirect("/studio/projects");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const paymobMode = process.env.PAYMOB_MODE ?? "mock";

  await prisma.order.update({
    where: { id: order.id },
    data: {
      customerName,
      customerPhone,
      customerEmail,
    },
  });

  if (paymobMode !== "live") {
    const paymentUrl = `${appUrl}/payment/mock?orderId=${order.id}`;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: PaymentStatus.PENDING,
        paymobIntentionId: `mock_${order.id}`,
        paymentUrl,
      },
    });

    redirect(paymentUrl);
  }

  const secretKey = process.env.PAYMOB_SECRET_KEY;
  const publicKey = process.env.PAYMOB_PUBLIC_KEY;
  const integrationId = Number(process.env.PAYMOB_INTEGRATION_ID ?? "0");
  const currency = process.env.PAYMOB_CURRENCY ?? order.currency;

  if (!secretKey || !publicKey || !integrationId) {
    throw new Error("Missing Paymob credentials.");
  }

  const response = await fetch("https://accept.paymob.com/v1/intention/", {
    method: "POST",
    headers: {
      Authorization: `Token ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: order.totalCents,
      currency,
      payment_methods: [integrationId],
      merchant_order_id: order.orderNumber,
      items: order.items.map((item) => ({
        name: "Custom T-Shirt",
        amount: item.totalCents,
        description: `${item.product} / ${item.fabric} / ${item.color}`,
        quantity: item.quantity,
      })),
      billing_data: {
        first_name: customerName ?? "Customer",
        last_name: "TGFM",
        email: customerEmail ?? "customer@example.com",
        phone_number: customerPhone,
      },
      extras: {
        localOrderId: order.id,
        orderNumber: order.orderNumber,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create Paymob payment intention.");
  }

  const data = (await response.json()) as PaymobIntentionResponse;

  const paymentUrl =
    `https://accept.paymob.com/unifiedcheckout/` +
    `?publicKey=${publicKey}` +
    `&clientSecret=${data.client_secret}`;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: PaymentStatus.PENDING,
      paymobIntentionId: data.id,
      paymobOrderId: data.order?.id ? String(data.order.id) : null,
      paymentUrl,
    },
  });

  redirect(paymentUrl);
}
