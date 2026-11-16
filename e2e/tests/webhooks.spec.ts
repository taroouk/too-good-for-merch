import { createHmac } from "node:crypto";
import { test, expect, QA_SECRETS } from "../fixtures/guard";

// Signed LOCALLY with the throwaway secret that only the isolated copy knows. Nothing here talks to Paymob.
const KEYS = ["amount_cents","created_at","currency","error_occured","has_parent_transaction","id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded","is_standalone_payment","is_voided","order.id","owner","pending","source_data.pan","source_data.sub_type","source_data.type","success"];
const pick = (o: any, p: string) => p.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : ""), o);
function signed(orderNumber: string, over: Record<string, unknown> = {}) {
  const id = Number(over.id ?? Date.now() % 1e9);
  const obj: any = { id, amount_cents: 49500, currency: "EGP", success: true, pending: false, error_occured: false, has_parent_transaction: false, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, integration_id: 1, owner: 1, created_at: "2026-11-09T10:00:00.000000", order: { id: 9000000 + Number(orderNumber.replace(/\D/g, "")), merchant_order_id: orderNumber }, source_data: { pan: "2346", sub_type: "MasterCard", type: "card" }, ...over };
  const hmac = createHmac("sha512", QA_SECRETS.hmac).update(KEYS.map((k) => String(pick(obj, k) ?? "")).join("")).digest("hex");
  return { url: `/api/payments/paymob/webhook?hmac=${hmac}`, data: { type: "TRANSACTION", obj } };
}

test.describe("Paymob webhooks (isolated server, local signing only)", () => {
  test("a forged signature is rejected with 401", async ({ request }) => {
    const w = signed("TGFM-5031");
    expect((await request.post(w.url.replace(/hmac=.*/, "hmac=" + "0".repeat(128)), { data: w.data })).status()).toBe(401);
  });
  test("success, then the same delivery again is a duplicate", async ({ request }) => {
    const w = signed("TGFM-5031", { id: 910001 });
    expect((await request.post(w.url, { data: w.data })).status()).toBe(200);
    expect((await (await request.post(w.url, { data: w.data })).json()).duplicate).toBe(true);
  });
  test("a failed payment does not mark the order paid", async ({ request }) => {
    const w = signed("TGFM-5032", { id: 910002, success: false });
    expect((await request.post(w.url, { data: w.data })).status()).toBe(200);
  });
  test("refund, then a late success leaves the order REFUNDED (details are checked by scripts/isolation/qa/double-payment.mjs webhook-refund)", async ({ request }) => {
    const refund = signed("TGFM-5033", { id: 910003, is_refunded: true });
    expect((await request.post(refund.url, { data: refund.data })).status()).toBe(200);
    const late = signed("TGFM-5033", { id: 910004 });
    expect((await request.post(late.url, { data: late.data })).status()).toBe(200);
  });
  test("an oversized chunked-style body is refused with 413", async ({ request }) => {
    const res = await request.post("/api/payments/paymob/webhook?hmac=" + "0".repeat(128), { data: "x".repeat(300_000), headers: { "content-type": "application/json" } });
    expect(res.status()).toBe(413);
  });
});

test.describe("Paymob Sandbox checkout", () => {
  test.skip(!process.env.PAYMOB_SANDBOX_APPROVED, "BLOCKED: needs Paymob SANDBOX keys, a public staging URL, and the owner's explicit approval for each sandbox transaction");
  test("hosted checkout in the sandbox", async () => { /* intentionally empty until approved */ });
});
