import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import type { Order, OrderItem, PaymentMethod, Prisma } from "@prisma/client";
import { SUPPORTED_PAYMENT_CURRENCY } from "../orders/currency";

const PAYMOB_BASE_URL = "https://accept.paymob.com";

type PaymobOrder = Order & { items: OrderItem[] };

export class PaymobError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}

// Paymob rejects a second create_order whose merchant_order_id it has
// already seen with 422 {"message":"duplicate"}. The first attempt for an
// order keeps using the plain orderNumber (unchanged behaviour); only a
// retry for an order Paymob already knows falls back to a suffixed id.
const RETRY_SUFFIX_PATTERN = /-R[0-9a-z]{6,}$/;

export function isDuplicateMerchantOrderError(error: unknown): boolean {
  if (!(error instanceof PaymobError)) return false;
  const details = error.details as { stage?: unknown; status?: unknown; response?: unknown } | undefined;
  if (!details || details.stage !== "create_order" || details.status !== 422) return false;
  const response = details.response;
  const message =
    response && typeof response === "object" ? (response as Record<string, unknown>).message : undefined;
  return typeof message === "string" && /duplicate/i.test(message);
}

export function retryMerchantOrderId(orderNumber: string, nonce: string = Date.now().toString(36)) {
  return `${orderNumber}-R${nonce}`;
}

// Maps a (possibly retry-suffixed) merchant_order_id back to Order.orderNumber.
export function baseOrderNumber(merchantOrderId: string) {
  return merchantOrderId.replace(RETRY_SUFFIX_PATTERN, "");
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

async function paymobFetch<T>(
  stage: string,
  path: string,
  body: unknown,
  reference: Record<string, unknown> | undefined,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`${PAYMOB_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
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
    street: [order.shippingAddressLine1, order.shippingAddressLine2].filter(Boolean).join(", ") || "NA",
    building: "NA",
    shipping_method: "NA",
    postal_code: order.shippingPostalCode || "NA",
    city: order.shippingCity || "Cairo",
    country: order.shippingCountry || "EG",
    state: order.shippingRegion || order.shippingCity || "Cairo",
  };
}

// createPaymobPayment makes 3 sequential calls for CARD (4 for WALLET). A
// per-call AbortSignal.timeout would let worst cases stack additively (each
// call independently allowed to take its own full timeout), so instead one
// deadline is created here and shared across every call in this invocation:
// the total time this function can spend talking to Paymob is bounded no
// matter how many sequential steps the chosen method requires. 25s is
// comfortably above Paymob's normal per-call latency (typically well under
// 2s) while keeping the route's total worst case (this budget plus the two
// short-lived DB transactions around it) under its 60s maxDuration -- see
// app/api/payments/paymob/create-intent/route.ts.
const PAYMOB_CALL_BUDGET_MS = 25_000;

async function createLegacyPaymobPayment(order: PaymobOrder, method: PaymentMethod) {
  // Only EGP is supported: an order in any other currency is never sent to Paymob (checked before any key or network use).
  if (order.currency !== SUPPORTED_PAYMENT_CURRENCY) {
    throw new PaymobError(`Only ${SUPPORTED_PAYMENT_CURRENCY} orders can be paid; this order is in ${order.currency}.`);
  }
  if (!Number.isSafeInteger(order.totalCents) || order.totalCents <= 0) {
    throw new PaymobError("Order amount is invalid.");
  }

  const reference = { orderId: order.id, orderNumber: order.orderNumber, amountCents: order.totalCents, currency: order.currency, method };
  const deadline = AbortSignal.timeout(PAYMOB_CALL_BUDGET_MS);

  const auth = await paymobFetch<{ token?: string }>(
    "auth",
    "/api/auth/tokens",
    { api_key: requiredEnv("PAYMOB_API_KEY") },
    reference,
    deadline,
  );
  if (!auth.token) throw new PaymobError("Paymob did not return an authentication token.");

  const createRemoteOrder = (merchantOrderId: string) =>
    paymobFetch<{ id?: number | string }>(
      "create_order",
      "/api/ecommerce/orders",
      {
        auth_token: auth.token,
        delivery_needed: false,
        amount_cents: order.totalCents,
        currency: order.currency,
        merchant_order_id: merchantOrderId,
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
      deadline,
    );

  let remoteOrder: { id?: number | string };
  try {
    remoteOrder = await createRemoteOrder(order.orderNumber);
  } catch (error) {
    if (!isDuplicateMerchantOrderError(error)) throw error;
    remoteOrder = await createRemoteOrder(retryMerchantOrderId(order.orderNumber));
  }
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
    deadline,
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
      deadline,
    );
    const paymentUrl = wallet.redirect_url ?? wallet.iframe_redirection_url ?? "";
    if (!paymentUrl) throw new PaymobError("Paymob wallet did not return a redirect URL.", wallet);
    return { paymentUrl, paymobOrderId: String(remoteOrder.id) };
  }

  const iframeId = encodeURIComponent(requiredEnv("PAYMOB_IFRAME_ID"));
  const paymentUrl = `${PAYMOB_BASE_URL}/api/acceptance/iframes/${iframeId}?payment_token=${encodeURIComponent(paymentKey.token)}`;
  return { paymentUrl, paymobOrderId: String(remoteOrder.id) };
}

// ---------------------------------------------------------------------------
// Payment Intention API + Unified Checkout (Paymob's current hosted checkout).
//
// Official docs (developers.paymob.com, read 8 Nov 2026):
//   POST {base}/v1/intention/   Authorization: Token <secret key>
//   body: amount (cents), currency, payment_methods (integration ids or names), items [{name, amount, ...}]
//         (the amount must equal the sum of items[].amount), billing_data (phone_number required),
//         special_reference (comes back as merchant_order_id in the transaction callback),
//         notification_url (server-to-server POST), redirection_url (customer, card/wallet).
//   response 201: client_secret, intention_order_id (the Paymob order id in the callback), id.
//   redirect:  https://eg.checkout.paymob.com/?publicKey=<public key>&clientSecret=<client secret>
// The transaction callback is the SAME processed callback (same HMAC-SHA512 field list) the Accept flow sends, so
// verifyPaymobHmac, the webhook route and the order matching are shared by both flows.
// The flow is chosen by configuration: PAYMOB_SECRET_KEY + PAYMOB_PUBLIC_KEY present -> intention (unless
// PAYMOB_FLOW=legacy); otherwise the legacy Accept flow (PAYMOB_API_KEY + PAYMOB_IFRAME_ID).
// ---------------------------------------------------------------------------
export type PaymobFlow = "intention" | "legacy";

export function paymobFlow(env: Record<string, string | undefined> = process.env): PaymobFlow {
  const forced = env.PAYMOB_FLOW?.trim().toLowerCase();
  if (forced === "legacy") return "legacy";
  if (forced === "intention") return "intention";
  return env.PAYMOB_SECRET_KEY?.trim() && env.PAYMOB_PUBLIC_KEY?.trim() ? "intention" : "legacy";
}

const DEFAULT_CHECKOUT_URL = "https://eg.checkout.paymob.com";

// A rejected special_reference (Paymob wants it unique per intention) is retried once with a suffixed reference,
// which baseOrderNumber() maps back to the order. The exact wording of that rejection is not documented, so any
// 400/422 whose body talks about special_reference / duplicate / unique counts.
export function isDuplicateSpecialReferenceError(error: unknown): boolean {
  if (!(error instanceof PaymobError)) return false;
  const details = error.details as { stage?: unknown; status?: unknown; response?: unknown } | undefined;
  if (!details || details.stage !== "intention" || (details.status !== 400 && details.status !== 422)) return false;
  const text = JSON.stringify(details.response ?? "");
  return /special_reference|duplicate|unique|already/i.test(text);
}

function appOrigin(): string {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) throw new PaymobError("Missing server configuration: NEXTAUTH_URL");
  return new URL(raw).origin;
}

// Pure: the body of the Create Intention request for an order. Amounts are the order's own total in piastres, the
// single item carries the whole total so "amount = sum of items" holds by construction.
export function buildIntentionBody(order: PaymobOrder, method: PaymentMethod, specialReference: string, origin: string, integration: number) {
  const billing = billingData(order);
  return {
    amount: order.totalCents,
    currency: order.currency,
    payment_methods: [integration],
    items: [
      {
        name: `Too Good For Merch order ${order.orderNumber}`.slice(0, 100),
        description: `${order.items.length} custom garment${order.items.length === 1 ? "" : "s"}`.slice(0, 255),
        amount: order.totalCents,
        quantity: 1,
      },
    ],
    billing_data: billing,
    customer: { first_name: billing.first_name, last_name: billing.last_name, email: billing.email },
    special_reference: specialReference,
    notification_url: `${origin}/api/payments/paymob/webhook`,
    redirection_url: `${origin}/orders/${order.id}/success`,
    extras: { orderNumber: order.orderNumber, method },
  };
}

async function createIntentionPayment(order: PaymobOrder, method: PaymentMethod) {
  if (order.currency !== SUPPORTED_PAYMENT_CURRENCY) {
    throw new PaymobError(`Only ${SUPPORTED_PAYMENT_CURRENCY} orders can be paid; this order is in ${order.currency}.`);
  }
  if (!Number.isSafeInteger(order.totalCents) || order.totalCents <= 0) {
    throw new PaymobError("Order amount is invalid.");
  }
  const secretKey = requiredEnv("PAYMOB_SECRET_KEY");
  const publicKey = requiredEnv("PAYMOB_PUBLIC_KEY");
  const integration = integrationId(method);
  const origin = appOrigin();
  const reference = { orderId: order.id, orderNumber: order.orderNumber, amountCents: order.totalCents, currency: order.currency, method };
  const deadline = AbortSignal.timeout(PAYMOB_CALL_BUDGET_MS);

  const create = async (specialReference: string) => {
    const response = await fetch(`${PAYMOB_BASE_URL}/v1/intention/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Token ${secretKey}` },
      body: JSON.stringify(buildIntentionBody(order, method, specialReference, origin, integration)),
      cache: "no-store",
      signal: deadline,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("[Paymob] intention request failed", { stage: "intention", status: response.status, ...reference, response: redact(data) });
      throw new PaymobError(`Paymob request failed (${response.status}).`, { stage: "intention", status: response.status, response: data });
    }
    return data as { client_secret?: string; intention_order_id?: number | string; id?: number | string };
  };

  let intention: { client_secret?: string; intention_order_id?: number | string; id?: number | string };
  try {
    intention = await create(order.orderNumber);
  } catch (error) {
    if (!isDuplicateSpecialReferenceError(error)) throw error;
    intention = await create(retryMerchantOrderId(order.orderNumber));
  }
  if (!intention.client_secret) throw new PaymobError("Paymob did not return a client secret.");
  const paymobOrderId = intention.intention_order_id ?? intention.id;
  if (paymobOrderId == null) throw new PaymobError("Paymob did not return an order ID.");

  const checkoutBase = (process.env.PAYMOB_CHECKOUT_URL?.trim() || DEFAULT_CHECKOUT_URL).replace(/\/+$/, "");
  const paymentUrl = `${checkoutBase}/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(intention.client_secret)}`;
  return { paymentUrl, paymobOrderId: String(paymobOrderId) };
}

export async function createPaymobPayment(order: PaymobOrder, method: PaymentMethod) {
  return paymobFlow() === "intention" ? createIntentionPayment(order, method) : createLegacyPaymobPayment(order, method);
}

// Full refund of a settled Paymob transaction. Paymob answers with the
// refund transaction; its processed webhook (handled in
// app/api/payments/paymob/webhook/route.ts, classifyTransaction -> refunded)
// is idempotent with the status the caller sets on success.
export async function refundPaymobTransaction(transactionId: string, amountCents: number) {
  if (!/^\d{1,20}$/.test(transactionId)) throw new PaymobError("Transaction id is invalid.");
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new PaymobError("Refund amount is invalid.");
  const reference = { transactionId, amountCents };
  const deadline = AbortSignal.timeout(PAYMOB_CALL_BUDGET_MS);
  const auth = await paymobFetch<{ token?: string }>("auth", "/api/auth/tokens", { api_key: requiredEnv("PAYMOB_API_KEY") }, reference, deadline);
  if (!auth.token) throw new PaymobError("Paymob did not return an authentication token.");
  const result = await paymobFetch<Record<string, unknown>>(
    "refund",
    "/api/acceptance/void_refund/refund",
    { auth_token: auth.token, transaction_id: Number(transactionId), amount_cents: amountCents },
    reference,
    deadline,
  );
  if (result.success === false) {
    throw new PaymobError("Paymob declined the refund.", { stage: "refund", response: result });
  }
  return { refundTransactionId: result.id != null ? String(result.id) : null };
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

export type SuccessfulPaymentClassification =
  | { isDuplicateCharge: true }
  | {
      isDuplicateCharge: false;
      update: {
        paymentStatus: typeof PaymentStatus.PAID;
        status: OrderStatus;
        paidAt: Date;
        paymobTransactionId: string | null;
        paymentFailureReason: null;
      };
    };

// P0-6: decides what a SUCCEEDED transaction should do to an order's
// payment state, given the order row read (and locked, via `SELECT ...
// FOR UPDATE`) inside the SAME database transaction that then applies this
// result -- never a copy of the order read before that lock was acquired.
// Paymob retries deliveries aggressively and can send two distinct
// transactions for the same order close together; without locking the read
// and write together, both requests could observe the pre-write "not yet
// PAID" snapshot and each write their own paymobTransactionId, silently
// losing the fact that a second charge went through. With the lock in
// place, the second request's `current` reflects the first's completed
// write, so this function sees paymentStatus already PAID with a
// DIFFERENT paymobTransactionId and flags it rather than overwriting it.
// A retried delivery of the SAME transaction id is not a double charge --
// idempotent re-application, not a second charge -- so it is treated as
// the normal (non-duplicate) path, safely re-writing the same values.
export function classifySuccessfulPayment(
  current: {
    paymentStatus: PaymentStatus;
    paymobTransactionId: string | null;
    status: OrderStatus;
    paidAt: Date | null;
  },
  transactionId: string | null,
  now: Date = new Date(),
): SuccessfulPaymentClassification {
  const isDuplicateCharge =
    current.paymentStatus === PaymentStatus.PAID &&
    current.paymobTransactionId != null &&
    transactionId != null &&
    current.paymobTransactionId !== transactionId;

  if (isDuplicateCharge) {
    return { isDuplicateCharge: true };
  }

  return {
    isDuplicateCharge: false,
    update: {
      paymentStatus: PaymentStatus.PAID,
      status: current.status === OrderStatus.NEW ? OrderStatus.PAID : current.status,
      paidAt: current.paidAt ?? now,
      paymobTransactionId: transactionId,
      paymentFailureReason: null,
    },
  };
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
