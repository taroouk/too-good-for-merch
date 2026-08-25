// file: src/lib/payments/__tests__/paymob.test.ts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
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
    });
  } finally {
    if (originalSecret === undefined) delete process.env.PAYMOB_HMAC_SECRET;
    else process.env.PAYMOB_HMAC_SECRET = originalSecret;
  }
}
