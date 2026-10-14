import assert from "node:assert/strict";
import { RESET_TOKEN_TTL_MS, buildResetEmail, generateResetToken, hashResetToken, normalizeEmail, passwordProblem, resetIdentifier } from "../password-reset";
import { buildOrderConfirmationEmail, humanizeKey } from "../../notify/order-content";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/auth/password-reset + order email", {
    "tokens are random, long, and only their SHA-256 is stored"() {
      const a = generateResetToken();
      const b = generateResetToken();
      assert.notEqual(a.raw, b.raw);
      assert.ok(a.raw.length >= 43);
      assert.equal(a.hash, hashResetToken(a.raw));
      assert.notEqual(a.hash, a.raw);
      assert.equal(a.hash.length, 64);
    },

    "identifier is namespaced and TTL is one hour"() {
      assert.equal(resetIdentifier("a@b.co"), "pwreset:a@b.co");
      assert.equal(RESET_TOKEN_TTL_MS, 3_600_000);
    },

    "normalizeEmail trims, lowercases and rejects junk"() {
      assert.equal(normalizeEmail("  Tarek@Example.COM "), "tarek@example.com");
      assert.equal(normalizeEmail("nope"), null);
      assert.equal(normalizeEmail(42), null);
      assert.equal(normalizeEmail(`${"a".repeat(250)}@b.co`), null);
    },

    "password bounds match registration"() {
      assert.equal(passwordProblem("12345678"), null);
      assert.ok(passwordProblem("short"));
      assert.ok(passwordProblem("x".repeat(129)));
      assert.ok(passwordProblem(undefined));
    },

    "reset email contains the link, escaped in html"() {
      const link = "https://x.test/reset-password?token=abc&email=a%40b.co";
      const mail = buildResetEmail(link);
      assert.ok(mail.text.includes(link));
      assert.ok(mail.html.includes("token=abc&amp;email=a%40b.co"));
      assert.ok(!mail.html.includes("&email="));
    },

    "order confirmation email lists items, totals, address and escapes html"() {
      assert.equal(humanizeKey("HEAVYWEIGHT_300"), "Heavyweight 300");
      const mail = buildOrderConfirmationEmail({
        orderNumber: "TG-1001",
        customerName: "<b>Sam</b>",
        items: [{ product: "OVERSIZED", color: "BLACK", fabric: "SIGNATURE_200", quantity: 3, unitPriceLabel: "EGP 500.00", totalLabel: "EGP 1,500.00", placements: ["CENTER_FRONT"] }],
        subtotalLabel: "EGP 1,500.00",
        shippingTaxLabel: "EGP 60.00",
        totalLabel: "EGP 1,560.00",
        addressLines: ["1 Nile St", "Cairo, Egypt"],
        orderUrl: "https://x.test/orders/abc",
        supportEmail: "hello@x.test",
        supportWhatsappUrl: null,
      });
      assert.ok(mail.subject.includes("TG-1001"));
      assert.ok(mail.text.includes("3 × Oversized · Black · Signature 200 — Center Front"));
      assert.ok(mail.text.includes("Total paid: EGP 1,560.00"));
      assert.ok(mail.text.includes("Cairo, Egypt"));
      assert.ok(mail.html.includes("&lt;b&gt;Sam&lt;/b&gt;"));
      assert.ok(!mail.html.includes("<b>Sam</b>"));
      assert.ok(mail.html.includes("https://x.test/orders/abc"));
    },
  });
}
