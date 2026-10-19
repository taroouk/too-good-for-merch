// file: src/lib/notify/__tests__/email-health.test.ts
import assert from "node:assert/strict";
import { emailSetup } from "../email-health";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("notify/email-health", {
    "no API key means nothing is sent"() {
      const s = emailSetup({ apiKey: "", from: "Shop <hi@shop.com>" });
      assert.equal(s.level, "fail");
      assert.equal(s.configured, false);
    },
    "the Resend test sender (or none) only works for the account owner"() {
      assert.equal(emailSetup({ apiKey: "re_x", from: null }).sandboxSender, true);
      assert.equal(emailSetup({ apiKey: "re_x", from: "Shop <onboarding@resend.dev>" }).level, "warn");
    },
    "own domain sender is healthy"() {
      const s = emailSetup({ apiKey: "re_x", from: "Too Good For Merch <orders@toogoodformerch.com>" });
      assert.equal(s.level, "ok");
      assert.equal(s.configured, true);
    },
  });
}
