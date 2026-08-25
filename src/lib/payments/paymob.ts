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

// Field names that must never reach the logs, even nested inside a Paymob
// response body (defense in depth - Paymob's own error payloads shouldn't
// echo our secrets back, but we don't want to rely on that).
const SENSITIVE_KEY_PATTERN = /key|secret|token|password|authorization|pan$|cvv|card_number/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redact(val),
      ]),
    );
  }
  return value;
}

async function paymobFetch<T>(stage: string, path: string, body: unknown, reference?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${PAYMOB_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const providerMessage = data && typeof data === "object" ? (data as Record<string, unknown>).message : undefined;
    const hint =
      typeof providerMessage === "string" && /invalid currency/i.test(providerMessage)
        ? "The currency sent doesn't match a currency enabled on PAYMOB_INTEGRATION_ID/PAYMOB_WALLET_INTEGRATION_ID in the Paymob dashboard. Check STORE_CURRENCY / /admin/settings against your Paymob account's configured currency."
        : undefined;
    console.error("[Paymob] request failed", {
      stage,
      path,
      status: response.status,
      ...reference,
      response: redact(data),
      ...(hint ? { hint } : {}),
    });
    throw new PaymobError(`Paymob request failed (${response.status}).`, { stage, status: response.status, response: data });
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

  const reference = { orderId: order.id, orderNumber: order.orderNumber, amountCents: order.totalCents, currency: order.currency, method };

  const auth = await paymobFetch<{ token?: string }>(
    "auth",
    "/api/auth/tokens",
    { api_key: requiredEnv("PAYMOB_API_KEY") },
    reference,
  );
  if (!auth.token) throw new PaymobError("Paymob did not return an authentication token.");

  const remoteOrder = await paymobFetch<{ id?: number | string }>(
    "create_order",
    "/api/ecommerce/orders",
    {
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
    },
    reference,
  );
  if (!remoteOrder.id) throw new PaymobError("Paymob did not return an order ID.", remoteOrder);

  const paymentKey = await paymobFetch<{ token?: string }>(
    "payment_key",
    "/api/acceptance/payment_keys",
    {
      auth_token: auth.token,
      amount_cents: order.totalCents,
      expiration: 3600,
      order_id: remoteOrder.id,
      billing_data: billingData(order),
      currency: order.currency,
      integration_id: integrationId(method),
      lock_order_when_paid: true,
    },
    { ...reference, paymobOrderId: remoteOrder.id },
  );
  if (!paymentKey.token) throw new PaymobError("Paymob did not return a payment key.", paymentKey);

  if (method === "WALLET") {
    const wallet = await paymobFetch<{ redirect_url?: string; iframe_redirection_url?: string }>(
      "wallet_pay",
      "/api/acceptance/payments/pay",
      {
        source: { identifier: order.customerPhone, subtype: "WALLET" },
        payment_token: paymentKey.token,
      },
      { ...reference, paymobOrderId: remoteOrder.id },
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

export type TransactionOutcome = {
  succeeded: boolean;
  refunded: boolean;
  failed: boolean;
};

// Pure classification of a (already HMAC-verified) Paymob transaction
// object into the outcomes the webhook acts on. The caller checks these in
// priority order (refunded, then succeeded, then failed) rather than
// treating them as mutually exclusive - `refunded` and `failed` can both
// be true for the same object (e.g. a declined-then-refunded edge case),
// and it's the caller's if/else priority that resolves it, matching
// Paymob's own event semantics rather than inventing new ones here.
export function classifyTransaction(object: Record<string, unknown>): TransactionOutcome {
  const succeeded = object.success === true && object.pending !== true && object.error_occured !== true;
  const refunded = object.is_refunded === true;
  const failed = !succeeded && object.pending !== true;
  return { succeeded, refunded, failed };
}

export type TransactionMatch = {
  amountMatches: boolean;
  currencyMatches: boolean;
  integrationIdMatches: boolean;
  allMatch: boolean;
};

// Cross-checks a Paymob transaction object against the order it claims to
// be for, and against the integration(s) this deployment actually owns.
// `knownIntegrationIds` empty means "not configured to check" (never the
// case once PAYMOB_INTEGRATION_ID is set) rather than "reject everything".
export function transactionMatchesOrder(
  object: Record<string, unknown>,
  order: { totalCents: number; currency: string },
  knownIntegrationIds: string[],
): TransactionMatch {
  const amountMatches = Number(object.amount_cents) === order.totalCents;
  const currencyMatches = String(object.currency ?? "").toUpperCase() === order.currency.toUpperCase();
  const integrationIdMatches =
    knownIntegrationIds.length === 0 || knownIntegrationIds.includes(String(object.integration_id ?? ""));
  return {
    amountMatches,
    currencyMatches,
    integrationIdMatches,
    allMatch: amountMatches && currencyMatches && integrationIdMatches,
  };
}
