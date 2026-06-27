import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Order, OrderItem, PaymentMethod, Prisma } from "@prisma/client";

const PAYMOB_BASE_URL = "https://accept.paymob.com";

type PaymobOrder = Order & { items: OrderItem[] };

export class PaymobError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new PaymobError(`Missing server configuration: ${name}`);
  return value;
}

async function paymobFetch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${PAYMOB_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PaymobError(`Paymob request failed (${response.status}).`, data);
  }
  return data as T;
}

function integrationId(method: PaymentMethod) {
  const key = method === "WALLET" ? "PAYMOB_WALLET_INTEGRATION_ID" : "PAYMOB_INTEGRATION_ID";
  const value = Number(requiredEnv(key));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PaymobError(`${key} must be a positive integer.`);
  }
  return value;
}

export function walletPaymentsEnabled() {
  return Boolean(process.env.PAYMOB_WALLET_INTEGRATION_ID?.trim());
}

function billingData(order: PaymobOrder) {
  const parts = (order.customerName ?? "Customer").trim().split(/\s+/);
  return {
    first_name: parts[0] || "Customer",
    last_name: parts.slice(1).join(" ") || "Customer",
    email: order.customerEmail ?? "customer@example.com",
    phone_number: order.customerPhone ?? "+201000000000",
    apartment: "NA",
    floor: "NA",
    street: "NA",
    building: "NA",
    shipping_method: "NA",
    postal_code: "NA",
    city: "Cairo",
    country: "EG",
    state: "Cairo",
  };
}

export async function createPaymobPayment(order: PaymobOrder, method: PaymentMethod) {
  if (!Number.isSafeInteger(order.totalCents) || order.totalCents <= 0) {
    throw new PaymobError("Order amount is invalid.");
  }

  const auth = await paymobFetch<{ token?: string }>("/api/auth/tokens", {
    api_key: requiredEnv("PAYMOB_API_KEY"),
  });
  if (!auth.token) throw new PaymobError("Paymob did not return an authentication token.");

  const remoteOrder = await paymobFetch<{ id?: number | string }>("/api/ecommerce/orders", {
    auth_token: auth.token,
    delivery_needed: false,
    amount_cents: order.totalCents,
    currency: order.currency,
    merchant_order_id: order.orderNumber,
    items: [
      ...order.items.map((item) => ({
        name: `${item.product} custom garment`.slice(0, 100),
        description: `${item.fabric} / ${item.color}`.slice(0, 255),
        amount_cents: item.unitPriceCents,
        quantity: item.quantity,
      })),
      ...(order.totalCents > order.subtotalCents
        ? [
            {
              name: "Tax and shipping",
              description: "Order charges",
              amount_cents: order.totalCents - order.subtotalCents,
              quantity: 1,
            },
          ]
        : []),
    ],
  });
  if (!remoteOrder.id) throw new PaymobError("Paymob did not return an order ID.", remoteOrder);

  const paymentKey = await paymobFetch<{ token?: string }>("/api/acceptance/payment_keys", {
    auth_token: auth.token,
    amount_cents: order.totalCents,
    expiration: 3600,
    order_id: remoteOrder.id,
    billing_data: billingData(order),
    currency: order.currency,
    integration_id: integrationId(method),
    lock_order_when_paid: true,
  });
  if (!paymentKey.token) throw new PaymobError("Paymob did not return a payment key.", paymentKey);

  if (method === "WALLET") {
    const wallet = await paymobFetch<{ redirect_url?: string; iframe_redirection_url?: string }>(
      "/api/acceptance/payments/pay",
      {
        source: { identifier: order.customerPhone, subtype: "WALLET" },
        payment_token: paymentKey.token,
      },
    );
    const paymentUrl = wallet.redirect_url ?? wallet.iframe_redirection_url ?? "";
    if (!paymentUrl) throw new PaymobError("Paymob wallet did not return a redirect URL.", wallet);
    return { paymentUrl, paymobOrderId: String(remoteOrder.id) };
  }

  const iframeId = encodeURIComponent(requiredEnv("PAYMOB_IFRAME_ID"));
  const paymentUrl = `${PAYMOB_BASE_URL}/api/acceptance/iframes/${iframeId}?payment_token=${encodeURIComponent(paymentKey.token)}`;
  return { paymentUrl, paymobOrderId: String(remoteOrder.id) };
}

export const TRANSACTION_HMAC_KEYS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

function nestedValue(object: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : "";
  }, object);
}

export function verifyPaymobHmac(object: Record<string, unknown>, received: string | null) {
  const secret = process.env.PAYMOB_HMAC_SECRET?.trim();
  if (!secret || !received || !/^[a-fA-F0-9]{128}$/.test(received)) return false;
  const source = TRANSACTION_HMAC_KEYS.map((key) => String(nestedValue(object, key) ?? "")).join("");
  const expected = createHmac("sha512", secret).update(source).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function webhookEventKey(payload: Prisma.JsonObject) {
  const obj =
    payload.obj && typeof payload.obj === "object" && !Array.isArray(payload.obj)
      ? (payload.obj as Prisma.JsonObject)
      : payload;
  const fingerprint = [payload.type, obj.id, obj.success, obj.pending, obj.is_refunded, obj.is_voided].join(":");
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return createHash("sha256").update(`${fingerprint}:${payloadHash}`).digest("hex");
}

export function paymentFailureReason(object: Record<string, unknown>) {
  const data = object.data && typeof object.data === "object" ? (object.data as Record<string, unknown>) : {};
  const message = data.message ?? data.error ?? object.txn_response_code ?? object.error_occured;
  return String(message || "Payment was declined by the processor.").slice(0, 500);
}
