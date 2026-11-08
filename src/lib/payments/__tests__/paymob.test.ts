// file: src/lib/payments/__tests__/paymob.test.ts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import {
  baseOrderNumber,
  buildIntentionBody,
  createPaymobPayment,
  isDuplicateSpecialReferenceError,
  paymobFlow,
  PaymobError,
  classifySuccessfulPayment,
  classifyTransaction,
  paymentFailureReason,
  transactionMatchesOrder,
  TRANSACTION_HMAC_KEYS,
  verifyPaymobHmac,
  webhookEventKey,
} from "../paymob";
import { runSuite } from "../../../testing/test-harness";

const SECRET = "test-hmac-secret-for-unit-tests-only";

function nestedValue(object: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : "";
  }, object);
}

function sign(object: Record<string, unknown>, secret = SECRET) {
  const source = TRANSACTION_HMAC_KEYS.map((key) => String(nestedValue(object, key) ?? "")).join("");
  return createHmac("sha512", secret).update(source).digest("hex");
}

const SAMPLE_TRANSACTION: Record<string, unknown> = {
  amount_cents: 5000,
  created_at: "2026-08-20T00:00:00Z",
  currency: "EGP",
  error_occured: false,
  has_parent_transaction: false,
  id: 123456,
  integration_id: 987,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 654321 },
  owner: 111,
  pending: false,
  source_data: { pan: "1234", sub_type: "Visa", type: "card" },
  success: true,
};

export async function runAll() {
  const originalSecret = process.env.PAYMOB_HMAC_SECRET;
  try {
    return await runSuite("lib/payments/paymob", {
      // ---- What the app WOULD send to Paymob (Accept "legacy" flow: auth token -> order registration -> payment key ->
      // hosted iframe, confirmed by the signed transaction callback). fetch is stubbed: NO network is used and the "keys"
      // below are obvious placeholders that exist only inside this test process.
      async "Paymob request contract: amounts, currency, key lifetime (nothing is sent anywhere)"() {
        const realFetch = globalThis.fetch;
        const sent: Array<{ path: string; body: Record<string, unknown> }> = [];
        const saved = { ...process.env };
        process.env.PAYMOB_API_KEY = "test-placeholder-not-a-key";
        process.env.PAYMOB_INTEGRATION_ID = "111";
        process.env.PAYMOB_IFRAME_ID = "222";
        globalThis.fetch = (async (url: string, init: { body: string }) => {
          const path = new URL(url).pathname;
          sent.push({ path, body: JSON.parse(init.body) });
          const reply = path.endsWith("/auth/tokens") ? { token: "auth-t" } : path.endsWith("/ecommerce/orders") ? { id: 4242 } : { token: "pay-k" };
          return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
        }) as unknown as typeof fetch;
        const base = { id: "o1", orderNumber: "TGFM-T-1", currency: "EGP", customerName: "A B", customerEmail: "a@b.test", customerPhone: "+201000000000" };
        try {
          // single item: USD 9.54 x 2 = EGP 1,908.00 (rate 50), no tax/shipping
          await createPaymobPayment({ ...base, subtotalCents: 190800, totalCents: 190800, items: [{ product: "FITTED", fabric: "SIGNATURE_200", color: "BLACK", quantity: 2, unitPriceCents: 954 }] } as never, "CARD" as never);
          // bag of three, with tax + shipping (total > subtotal)
          await createPaymobPayment({ ...base, subtotalCents: 193800, totalCents: 200000, items: [
            { product: "FITTED", fabric: "SIGNATURE_200", color: "BLACK", quantity: 1, unitPriceCents: 954 },
            { product: "OVERSIZED", fabric: "ESSENTIALS_170", color: "WHITE", quantity: 2, unitPriceCents: 840 },
            { product: "OVERSIZED", fabric: "HEAVYWEIGHT_300", color: "BLACK", quantity: 1, unitPriceCents: 1242 },
          ] } as never, "CARD" as never);
        } finally {
          globalThis.fetch = realFetch;
          for (const key of ["PAYMOB_API_KEY", "PAYMOB_INTEGRATION_ID", "PAYMOB_IFRAME_ID"]) {
            if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
          }
        }
        const reg = sent.filter((call) => call.path.endsWith("/ecommerce/orders")).map((call) => call.body);
        const keys = sent.filter((call) => call.path.endsWith("/payment_keys")).map((call) => call.body);
        assert.equal(reg.length, 2);
        assert.equal(keys.length, 2);
        // order-level amounts: EGP piastres, the order's own total, in EGP, identical at registration and payment key
        assert.deepEqual(reg.map((body) => [body.amount_cents, body.currency, body.delivery_needed]), [[190800, "EGP", false], [200000, "EGP", false]]);
        assert.deepEqual(keys.map((body) => [body.amount_cents, body.currency, body.expiration, body.lock_order_when_paid, body.order_id, body.integration_id]), [
          [190800, "EGP", 3600, true, 4242, 111],
          [200000, "EGP", 3600, true, 4242, 111],
        ]);
        assert.deepEqual(reg.map((body) => body.merchant_order_id), ["TGFM-T-1", "TGFM-T-1"]);
        // line items: one per order item (name/description/quantity), plus ONE "Tax and shipping" line when total > subtotal
        const lines = (reg[1].items as Array<{ name: string; amount_cents: number; quantity: number }>);
        assert.equal(lines.length, 4);
        assert.deepEqual(lines.slice(0, 3).map((line) => [line.amount_cents, line.quantity]), [[954, 1], [840, 2], [1242, 1]]);
        assert.deepEqual([lines[3].name, lines[3].amount_cents, lines[3].quantity], ["Tax and shipping", 6200, 1]);
        assert.equal((reg[0].items as unknown[]).length, 1, "no fee line when total equals subtotal");
        // CHARACTERIZATION, NOT PROVEN HARMFUL: item amounts are the order items' canonical USD cents, while amount_cents and the
        // fee line are EGP piastres, so the items do not add up to amount_cents. Paymob's public reference describes `items` as
        // the order contents and states no sum rule (its own example does not sum either); whether the live service validates or
        // displays them needs a Paymob SANDBOX call. This assertion documents today's behaviour; do not "fix" it without that test.
        const itemSum = lines.reduce((sum, line) => sum + line.amount_cents * line.quantity, 0);
        assert.notEqual(itemSum, reg[1].amount_cents);
      },

      async "an order that is not in EGP is never sent to Paymob (refused before any key or network use)"() {
        const realFetch = globalThis.fetch;
        let calls = 0;
        globalThis.fetch = (() => { calls += 1; throw new Error("network must not be touched"); }) as typeof fetch;
        const keys = { PAYMOB_API_KEY: process.env.PAYMOB_API_KEY };
        delete process.env.PAYMOB_API_KEY; // would otherwise be the first thing to fail, so this proves the order of checks
        try {
          for (const currency of ["USD", "EUR", "usd", ""]) {
            await assert.rejects(
              () => createPaymobPayment({ id: "o", orderNumber: "N", totalCents: 100, subtotalCents: 100, currency, items: [] } as never, "CARD" as never),
              (error: unknown) => error instanceof PaymobError && /Only EGP orders can be paid/.test(error.message),
            );
          }
          assert.equal(calls, 0);
        } finally {
          globalThis.fetch = realFetch;
          if (keys.PAYMOB_API_KEY !== undefined) process.env.PAYMOB_API_KEY = keys.PAYMOB_API_KEY;
        }
      },

      "verifyPaymobHmac accepts a correctly signed payload"() {
        process.env.PAYMOB_HMAC_SECRET = SECRET;
        const signature = sign(SAMPLE_TRANSACTION);
        assert.equal(verifyPaymobHmac(SAMPLE_TRANSACTION, signature), true);
      },

      "verifyPaymobHmac rejects a tampered payload (e.g. amount changed in transit)"() {
        process.env.PAYMOB_HMAC_SECRET = SECRET;
        const signature = sign(SAMPLE_TRANSACTION);
        const tampered = { ...SAMPLE_TRANSACTION, amount_cents: 999999 };
        assert.equal(verifyPaymobHmac(tampered, signature), false);
      },

      "verifyPaymobHmac rejects a signature produced with the wrong secret"() {
        process.env.PAYMOB_HMAC_SECRET = SECRET;
        const signature = sign(SAMPLE_TRANSACTION, "a-different-secret");
        assert.equal(verifyPaymobHmac(SAMPLE_TRANSACTION, signature), false);
      },

      "verifyPaymobHmac rejects everything when no secret is configured"() {
        delete process.env.PAYMOB_HMAC_SECRET;
        const signature = sign(SAMPLE_TRANSACTION);
        assert.equal(verifyPaymobHmac(SAMPLE_TRANSACTION, signature), false);
      },

      "verifyPaymobHmac rejects malformed (non-hex / wrong-length) signatures"() {
        process.env.PAYMOB_HMAC_SECRET = SECRET;
        assert.equal(verifyPaymobHmac(SAMPLE_TRANSACTION, "not-hex"), false);
        assert.equal(verifyPaymobHmac(SAMPLE_TRANSACTION, null), false);
        assert.equal(verifyPaymobHmac(SAMPLE_TRANSACTION, "ab".repeat(10)), false);
      },

      "webhookEventKey is stable for an identical payload (dedups retried deliveries)"() {
        const payload = { type: "TRANSACTION", obj: SAMPLE_TRANSACTION } as unknown as Prisma.JsonObject;
        assert.equal(webhookEventKey(payload), webhookEventKey(payload));
      },

      "webhookEventKey differs when the transaction outcome changes (not a duplicate)"() {
        const pending = {
          type: "TRANSACTION",
          obj: { ...SAMPLE_TRANSACTION, success: false, pending: true },
        } as unknown as Prisma.JsonObject;
        const succeeded = {
          type: "TRANSACTION",
          obj: { ...SAMPLE_TRANSACTION, success: true, pending: false },
        } as unknown as Prisma.JsonObject;
        assert.notEqual(webhookEventKey(pending), webhookEventKey(succeeded));
      },

      "paymentFailureReason extracts a human-readable message"() {
        assert.equal(paymentFailureReason({ data: { message: "Card declined" } }), "Card declined");
      },

      "paymentFailureReason falls back to a generic message when nothing is provided"() {
        assert.equal(paymentFailureReason({}), "Payment was declined by the processor.");
      },

      "classifyTransaction: a valid successful transaction is succeeded only"() {
        const result = classifyTransaction(SAMPLE_TRANSACTION);
        assert.deepEqual(result, { succeeded: true, refunded: false, failed: false });
      },

      "classifyTransaction: a declined transaction is failed only"() {
        const result = classifyTransaction({ ...SAMPLE_TRANSACTION, success: false });
        assert.deepEqual(result, { succeeded: false, refunded: false, failed: true });
      },

      "classifyTransaction: a pending transaction is neither succeeded nor failed (never terminal)"() {
        const result = classifyTransaction({ ...SAMPLE_TRANSACTION, success: false, pending: true });
        assert.deepEqual(result, { succeeded: false, refunded: false, failed: false });
      },

      "classifyTransaction: error_occured forces failed even if success is true"() {
        const result = classifyTransaction({ ...SAMPLE_TRANSACTION, success: true, error_occured: true });
        assert.deepEqual(result, { succeeded: false, refunded: false, failed: true });
      },

      "classifyTransaction: a refunded transaction is flagged refunded (caller prioritizes it over failed)"() {
        const result = classifyTransaction({ ...SAMPLE_TRANSACTION, success: false, is_refunded: true });
        assert.equal(result.refunded, true);
      },

      "transactionMatchesOrder: accepts a transaction that matches amount, currency, and integration"() {
        const order = { totalCents: 5000, currency: "EGP" };
        const result = transactionMatchesOrder(SAMPLE_TRANSACTION, order, ["987"]);
        assert.deepEqual(result, {
          amountMatches: true,
          currencyMatches: true,
          integrationIdMatches: true,
          allMatch: true,
        });
      },

      "transactionMatchesOrder: rejects a mismatched amount (client/provider amount tampering)"() {
        const order = { totalCents: 999999, currency: "EGP" };
        const result = transactionMatchesOrder(SAMPLE_TRANSACTION, order, ["987"]);
        assert.equal(result.amountMatches, false);
        assert.equal(result.allMatch, false);
      },

      "transactionMatchesOrder: rejects a mismatched currency"() {
        const order = { totalCents: 5000, currency: "USD" };
        const result = transactionMatchesOrder(SAMPLE_TRANSACTION, order, ["987"]);
        assert.equal(result.currencyMatches, false);
        assert.equal(result.allMatch, false);
      },

      "transactionMatchesOrder: currency comparison is case-insensitive"() {
        const order = { totalCents: 5000, currency: "egp" };
        const result = transactionMatchesOrder(SAMPLE_TRANSACTION, order, ["987"]);
        assert.equal(result.currencyMatches, true);
      },

      "transactionMatchesOrder: rejects an integration_id that isn't ours (a different Paymob integration on the same account)"() {
        const order = { totalCents: 5000, currency: "EGP" };
        const result = transactionMatchesOrder(SAMPLE_TRANSACTION, order, ["111222"]);
        assert.equal(result.integrationIdMatches, false);
        assert.equal(result.allMatch, false);
      },

      "transactionMatchesOrder: accepts any integration_id when none are configured to check"() {
        const order = { totalCents: 5000, currency: "EGP" };
        const result = transactionMatchesOrder(SAMPLE_TRANSACTION, order, []);
        assert.equal(result.integrationIdMatches, true);
      },

      // P0-6 regression: two DIFFERENT Paymob transaction ids both claiming
      // success against the SAME order. The webhook route reads `current`
      // under a `SELECT ... FOR UPDATE` lock held for the duration of the
      // transaction that also writes the result, so a second concurrent
      // delivery can only ever be processed against the state the first
      // one already committed -- never the pre-write snapshot. Modelled
      // here by feeding classifySuccessfulPayment's own output back in as
      // the next call's `current`, exactly what the locked, serialized
      // reads in the route produce.
      "classifySuccessfulPayment: first of two racing transaction ids for a PENDING order succeeds normally"() {
        const pending = {
          paymentStatus: PaymentStatus.PENDING,
          paymobTransactionId: null,
          status: OrderStatus.NEW,
          paidAt: null,
        };
        const now = new Date("2026-01-01T00:00:00Z");
        const first = classifySuccessfulPayment(pending, "txn-A", now);
        assert.equal(first.isDuplicateCharge, false);
        if (first.isDuplicateCharge) throw new Error("unreachable");
        assert.deepEqual(first.update, {
          paymentStatus: PaymentStatus.PAID,
          status: OrderStatus.PAID,
          paidAt: now,
          paymobTransactionId: "txn-A",
          paymentFailureReason: null,
        });
      },

      "classifySuccessfulPayment: a second, DIFFERENT transaction id against the now-PAID order is flagged as a possible double charge, not silently applied"() {
        const now = new Date("2026-01-01T00:00:00Z");
        const afterFirstCharge = {
          paymentStatus: PaymentStatus.PAID,
          paymobTransactionId: "txn-A",
          status: OrderStatus.PAID,
          paidAt: now,
        };
        const second = classifySuccessfulPayment(afterFirstCharge, "txn-B", now);
        assert.deepEqual(second, { isDuplicateCharge: true });
      },

      "classifySuccessfulPayment: a retried delivery of the SAME transaction id is idempotent, not a double charge"() {
        const now = new Date("2026-01-01T00:00:00Z");
        const afterFirstCharge = {
          paymentStatus: PaymentStatus.PAID,
          paymobTransactionId: "txn-A",
          status: OrderStatus.PAID,
          paidAt: now,
        };
        const retry = classifySuccessfulPayment(afterFirstCharge, "txn-A", new Date("2026-01-01T00:05:00Z"));
        assert.equal(retry.isDuplicateCharge, false);
        if (retry.isDuplicateCharge) throw new Error("unreachable");
        // paidAt is preserved from the first charge, not reset to the retry's `now`.
        assert.deepEqual(retry.update.paidAt, now);
        assert.equal(retry.update.paymobTransactionId, "txn-A");
      },

      // ---- Payment Intention + Unified Checkout (documented Paymob flow). fetch is stubbed: no network, placeholder keys.
      "paymobFlow: secret + public key select the intention flow, otherwise legacy; PAYMOB_FLOW overrides"() {
        assert.equal(paymobFlow({}), "legacy");
        assert.equal(paymobFlow({ PAYMOB_API_KEY: "a", PAYMOB_IFRAME_ID: "1" }), "legacy");
        assert.equal(paymobFlow({ PAYMOB_SECRET_KEY: "s" }), "legacy");
        assert.equal(paymobFlow({ PAYMOB_SECRET_KEY: "s", PAYMOB_PUBLIC_KEY: "p" }), "intention");
        assert.equal(paymobFlow({ PAYMOB_SECRET_KEY: "s", PAYMOB_PUBLIC_KEY: "p", PAYMOB_FLOW: "legacy" }), "legacy");
        assert.equal(paymobFlow({ PAYMOB_FLOW: "intention" }), "intention");
      },

      "intention request contract: endpoint, Token header, amount = sum of items, references, URLs (nothing is sent anywhere)"() {
        const order = { id: "o1", orderNumber: "TGFM-T-9", currency: "EGP", subtotalCents: 190800, totalCents: 200000, customerName: "A B", customerEmail: "a@b.test", customerPhone: "+201000000000", items: [{}, {}] };
        const body = buildIntentionBody(order as never, "CARD" as never, "TGFM-T-9", "https://shop.example", 111);
        assert.equal(body.amount, 200000);
        assert.equal(body.currency, "EGP");
        assert.deepEqual(body.payment_methods, [111]);
        assert.equal(body.items.reduce((sum, item) => sum + item.amount * item.quantity, 0), body.amount);
        assert.equal(body.special_reference, "TGFM-T-9");
        assert.equal(body.notification_url, "https://shop.example/api/payments/paymob/webhook");
        assert.equal(body.redirection_url, "https://shop.example/orders/o1/success");
        assert.ok(body.billing_data.phone_number);
        assert.ok(!JSON.stringify(body).includes("secret"));
      },

      async "createPaymobPayment (intention): one POST to /v1/intention/ with the secret key header, returns the Unified Checkout URL"() {
        const realFetch = globalThis.fetch;
        const saved = { ...process.env };
        const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
        Object.assign(process.env, { PAYMOB_SECRET_KEY: "egy_sk_test_PLACEHOLDER", PAYMOB_PUBLIC_KEY: "egy_pk_test_PLACEHOLDER", PAYMOB_INTEGRATION_ID: "111", NEXTAUTH_URL: "https://shop.example/" });
        delete process.env.PAYMOB_FLOW;
        globalThis.fetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
          calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
          return new Response(JSON.stringify({ client_secret: "cs_test_123", intention_order_id: 7788, id: "int_1" }), { status: 201, headers: { "content-type": "application/json" } });
        }) as unknown as typeof fetch;
        const order = { id: "o1", orderNumber: "TGFM-T-9", currency: "EGP", subtotalCents: 190800, totalCents: 200000, customerName: "A B", customerEmail: "a@b.test", customerPhone: "+201000000000", items: [] };
        let result: { paymentUrl: string; paymobOrderId: string };
        try {
          result = await createPaymobPayment(order as never, "CARD" as never);
        } finally {
          globalThis.fetch = realFetch;
          for (const key of ["PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY", "PAYMOB_INTEGRATION_ID", "NEXTAUTH_URL", "PAYMOB_FLOW"]) {
            if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
          }
        }
        assert.equal(calls.length, 1, "exactly one Paymob call (no auth-token / order / payment-key steps)");
        assert.equal(new URL(calls[0].url).pathname, "/v1/intention/");
        assert.equal(calls[0].headers.Authorization, "Token egy_sk_test_PLACEHOLDER");
        assert.equal(calls[0].body.amount, 200000);
        assert.equal(calls[0].body.special_reference, "TGFM-T-9");
        assert.equal(result.paymobOrderId, "7788");
        const url = new URL(result.paymentUrl);
        assert.equal(url.origin, "https://eg.checkout.paymob.com");
        assert.equal(url.searchParams.get("publicKey"), "egy_pk_test_PLACEHOLDER");
        assert.equal(url.searchParams.get("clientSecret"), "cs_test_123");
        assert.ok(!result.paymentUrl.includes("egy_sk_"), "the secret key never appears in the URL");
      },

      async "createPaymobPayment (intention): a rejected special_reference is retried once with a suffixed reference that maps back to the order"() {
        const realFetch = globalThis.fetch;
        const saved = { ...process.env };
        const refs: string[] = [];
        Object.assign(process.env, { PAYMOB_SECRET_KEY: "sk", PAYMOB_PUBLIC_KEY: "pk", PAYMOB_INTEGRATION_ID: "111", NEXTAUTH_URL: "https://shop.example" });
        const originalError = console.error;
        console.error = () => {};
        globalThis.fetch = (async (_url: string, init: { body: string }) => {
          refs.push(JSON.parse(init.body).special_reference);
          if (refs.length === 1) return new Response(JSON.stringify({ special_reference: ["intention with this special reference already exists."] }), { status: 400 });
          return new Response(JSON.stringify({ client_secret: "cs", intention_order_id: 1 }), { status: 201 });
        }) as unknown as typeof fetch;
        const order = { id: "o1", orderNumber: "TGFM-T-9", currency: "EGP", subtotalCents: 1000, totalCents: 1000, customerName: "A", customerEmail: "a@b.test", customerPhone: "+201000000000", items: [] };
        try {
          await createPaymobPayment(order as never, "CARD" as never);
        } finally {
          globalThis.fetch = realFetch;
          console.error = originalError;
          for (const key of ["PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY", "PAYMOB_INTEGRATION_ID", "NEXTAUTH_URL"]) {
            if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
          }
        }
        assert.equal(refs.length, 2);
        assert.equal(refs[0], "TGFM-T-9");
        assert.notEqual(refs[1], "TGFM-T-9");
        assert.equal(baseOrderNumber(refs[1]), "TGFM-T-9");
        assert.equal(isDuplicateSpecialReferenceError(new PaymobError("x", { stage: "intention", status: 401, response: { detail: "unique" } })), false, "only 400/422 count");
      },

      async "createPaymobPayment (intention): refuses non-EGP, bad amounts and missing keys before any network call; errors never contain the key"() {
        const realFetch = globalThis.fetch;
        const saved = { ...process.env };
        let calls = 0;
        globalThis.fetch = (async () => { calls++; return new Response("{}", { status: 401 }); }) as unknown as typeof fetch;
        const originalError = console.error;
        console.error = () => {};
        const base = { id: "o1", orderNumber: "TGFM-T-9", customerName: "A", customerEmail: "a@b.test", customerPhone: "+201000000000", items: [] };
        const messages: string[] = [];
        try {
          Object.assign(process.env, { PAYMOB_SECRET_KEY: "egy_sk_test_SECRETVALUE", PAYMOB_PUBLIC_KEY: "pk", PAYMOB_INTEGRATION_ID: "111", NEXTAUTH_URL: "https://shop.example" });
          for (const order of [{ ...base, currency: "USD", subtotalCents: 1000, totalCents: 1000 }, { ...base, currency: "EGP", subtotalCents: 0, totalCents: 0 }, { ...base, currency: "EGP", subtotalCents: 10.5, totalCents: 10.5 }]) {
            await createPaymobPayment(order as never, "CARD" as never).then(() => messages.push("NO ERROR"), (error: Error) => messages.push(error.message));
          }
          assert.equal(calls, 0, "no request was made for invalid orders");
          delete process.env.PAYMOB_PUBLIC_KEY; // flow falls back to legacy, which needs its own keys -> clear error, still no network
          process.env.PAYMOB_FLOW = "intention";
          await createPaymobPayment({ ...base, currency: "EGP", subtotalCents: 1000, totalCents: 1000 } as never, "CARD" as never).then(() => messages.push("NO ERROR"), (error: Error) => messages.push(error.message));
          process.env.PAYMOB_PUBLIC_KEY = "pk";
          await createPaymobPayment({ ...base, currency: "EGP", subtotalCents: 1000, totalCents: 1000 } as never, "CARD" as never).then(() => messages.push("NO ERROR"), (error: Error) => messages.push(error.message)); // 401 from the stub
        } finally {
          globalThis.fetch = realFetch;
          console.error = originalError;
          for (const key of ["PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY", "PAYMOB_INTEGRATION_ID", "NEXTAUTH_URL", "PAYMOB_FLOW"]) {
            if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
          }
        }
        assert.ok(messages.every((message) => message !== "NO ERROR"), messages.join(" | "));
        assert.match(messages[0], /Only EGP/);
        assert.match(messages[1], /amount is invalid/);
        assert.match(messages[2], /amount is invalid/);
        assert.match(messages[3], /PAYMOB_PUBLIC_KEY/);
        assert.match(messages[4], /failed \(401\)/);
        assert.ok(messages.every((message) => !message.includes("SECRETVALUE")), "no error message contains the secret key");
      },

      "an intention callback is the same signed transaction: its special_reference arrives as merchant_order_id and maps back to the order"() {
        const object = { ...SAMPLE_TRANSACTION, order: { id: 7788, merchant_order_id: "TGFM-T-9-Rabc123x" } };
        assert.equal(verifyPaymobHmac(object, sign(object)), true);
        assert.equal(baseOrderNumber(String((object.order as { merchant_order_id: string }).merchant_order_id)), "TGFM-T-9");
        const tampered = { ...object, amount_cents: 1 };
        assert.equal(verifyPaymobHmac(tampered, sign(object)), false);
      },

      "classifySuccessfulPayment: does not regress a non-NEW order status (e.g. already in production) back to PAID-only bookkeeping"() {
        const current = {
          paymentStatus: PaymentStatus.PENDING,
          paymobTransactionId: null,
          status: OrderStatus.IN_PRODUCTION,
          paidAt: null,
        };
        const result = classifySuccessfulPayment(current, "txn-A", new Date());
        assert.equal(result.isDuplicateCharge, false);
        if (result.isDuplicateCharge) throw new Error("unreachable");
        assert.equal(result.update.status, OrderStatus.IN_PRODUCTION);
      },
    });
  } finally {
    if (originalSecret === undefined) delete process.env.PAYMOB_HMAC_SECRET;
    else process.env.PAYMOB_HMAC_SECRET = originalSecret;
  }
}
