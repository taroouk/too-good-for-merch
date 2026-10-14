import assert from "node:assert/strict";
import { safeAdminPath, withFlash } from "../action-url";
import { findOverlappingRule, validateTier } from "../pricing-rules";
import { evaluateRoleChange } from "../team";
import { confirmationMatches, markPaidBlocker, reasonProblem, refundBlocker } from "../payment-rules";

import { DEFAULT_FABRICS, fabricCopyProblem, fabricKeyProblem, productCopyProblem } from "../../catalog-shared";
import { canMarkShipped, canTransition, plainStatusButtons, validateTracking } from "../../orders/status-flow";
import { buildOrderShippedEmail } from "../../notify/order-content";
import { findPlaceholders, isLegalSlug, legalPageProblem, parseLegalBody } from "../../legal-format";
import { avatarInitial, buildNavModel, displayNameFromEmail, headerHidden, studioProjectId } from "../../../components/site/nav-model";
import { checkoutHref, normalizeBagSize } from "../../bag";
import { orderItemExtras } from "../../orders/display";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compareMigrations, EXPECTED_LATEST_MIGRATION } from "../expected-migration";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/admin/admin-logic", {
    "safeAdminPath only allows same-origin /admin paths"() {
  assert.equal(safeAdminPath("/admin/users?q=a", "/admin"), "/admin/users?q=a");
  assert.equal(safeAdminPath("/admin", "/x"), "/admin");
  assert.equal(safeAdminPath("//evil.com", "/admin"), "/admin");
  assert.equal(safeAdminPath("https://evil.com", "/admin"), "/admin");
  assert.equal(safeAdminPath("/adminx", "/admin"), "/admin");
  assert.equal(safeAdminPath("/admin\\..", "/admin"), "/admin");
  assert.equal(safeAdminPath(null, "/admin/users"), "/admin/users");
},

    "withFlash replaces previous flash params and keeps filters"() {
  assert.equal(withFlash("/admin/users?q=a&notice=old", "notice", "Saved"), "/admin/users?q=a&notice=Saved");
  assert.equal(withFlash("/admin/pricing?error=x", "error", "Bad input"), "/admin/pricing?error=Bad+input");
},

    "findOverlappingRule detects intersecting ranges for same product+fabric only"() {
  const rules = [{ id: "a", product: "FITTED", fabric: "SIGNATURE_200", minQty: 1, maxQty: 9 }];
  assert.ok(findOverlappingRule(rules, { product: "FITTED", fabric: "SIGNATURE_200", minQty: 9, maxQty: 20 }));
  assert.equal(findOverlappingRule(rules, { product: "FITTED", fabric: "SIGNATURE_200", minQty: 10, maxQty: 20 }), null);
  assert.equal(findOverlappingRule(rules, { product: "OVERSIZED", fabric: "SIGNATURE_200", minQty: 1, maxQty: 9 }), null);
  assert.equal(findOverlappingRule(rules, { id: "a", product: "FITTED", fabric: "SIGNATURE_200", minQty: 1, maxQty: 12 }), null);
},

    "validateTier rejects bad quantities and prices"() {
  assert.equal(validateTier({ minQty: 1, maxQty: 10, unitPrice: 20 }), null);
  assert.ok(validateTier({ minQty: 0, maxQty: 10, unitPrice: 20 }));
  assert.ok(validateTier({ minQty: 5, maxQty: 2, unitPrice: 20 }));
  assert.ok(validateTier({ minQty: 1, maxQty: 501, unitPrice: 20 }));
  assert.ok(validateTier({ minQty: 1.5, maxQty: 3, unitPrice: 20 }));
  assert.ok(validateTier({ minQty: 1, maxQty: 3, unitPrice: 0 }));
},

    "evaluateRoleChange guards self-change, last admin, blocked promotion"() {
  const base = { actorId: "a", targetId: "b", targetRole: "USER", targetBlocked: false, nextRole: "ADMIN" as const, otherActiveAdmins: 1 };
  assert.equal(evaluateRoleChange(base), null);
  assert.ok(evaluateRoleChange({ ...base, targetId: "a" }));
  assert.ok(evaluateRoleChange({ ...base, targetBlocked: true }));
  assert.ok(evaluateRoleChange({ ...base, targetRole: "ADMIN" }));
  assert.ok(evaluateRoleChange({ ...base, targetRole: "ADMIN", nextRole: "USER", otherActiveAdmins: 0 }));
  assert.equal(evaluateRoleChange({ ...base, targetRole: "ADMIN", nextRole: "USER", otherActiveAdmins: 1 }), null);
},
    "markPaidBlocker only allows unpaid, non-cancelled, non-refunded orders"() {
      const base = { paymentStatus: "PENDING", status: "NEW", paymobTransactionId: null, totalCents: 1000 };
      assert.equal(markPaidBlocker(base), null);
      assert.equal(markPaidBlocker({ ...base, paymentStatus: "FAILED" }), null);
      assert.ok(markPaidBlocker({ ...base, paymentStatus: "PAID" }));
      assert.ok(markPaidBlocker({ ...base, paymentStatus: "REFUNDED" }));
      assert.ok(markPaidBlocker({ ...base, status: "CANCELLED" }));
    },

    "refundBlocker needs a PAID order with a Paymob transaction"() {
      const base = { paymentStatus: "PAID", status: "PAID", paymobTransactionId: "123456", totalCents: 5000 };
      assert.equal(refundBlocker(base), null);
      assert.ok(refundBlocker({ ...base, paymentStatus: "PENDING" }));
      assert.ok(refundBlocker({ ...base, paymentStatus: "REFUNDED" }));
      assert.ok(refundBlocker({ ...base, paymobTransactionId: null }));
      assert.ok(refundBlocker({ ...base, totalCents: 0 }));
    },

    "reason and order-number confirmation are enforced"() {
      assert.ok(reasonProblem("  no "));
      assert.equal(reasonProblem("customer paid by transfer"), null);
      assert.equal(confirmationMatches(" tg-1001 ", "TG-1001"), true);
      assert.equal(confirmationMatches("TG-1002", "TG-1001"), false);
      assert.equal(confirmationMatches("", "TG-1001"), false);
    },

    "fabric keys must be safe UPPER_SNAKE identifiers"() {
      assert.equal(fabricKeyProblem("LINEN_180"), null);
      assert.ok(fabricKeyProblem("linen"));
      assert.ok(fabricKeyProblem("A1"));
      assert.ok(fabricKeyProblem("1LINEN"));
      assert.ok(fabricKeyProblem("LINEN-180"));
      assert.ok(fabricKeyProblem("CUSTOM"));
      assert.ok(fabricKeyProblem("X".repeat(41)));
    },

    "catalog copy validation and built-in defaults"() {
      assert.equal(fabricCopyProblem({ name: "LINEN", gsm: "180 GSM Linen", description: "Breathable summer linen." }), null);
      assert.ok(fabricCopyProblem({ name: "L", gsm: "180 GSM", description: "Breathable." }));
      assert.ok(fabricCopyProblem({ name: "LINEN", gsm: "180 GSM", description: "no" }));
      assert.equal(productCopyProblem({ name: "Boxy Tee", tagline: "Roomy" }), null);
      assert.ok(productCopyProblem({ name: "x", tagline: "Roomy" }));
      assert.deepEqual(DEFAULT_FABRICS.map((f) => f.key), ["ESSENTIALS_170", "SIGNATURE_200", "HEAVYWEIGHT_300"]);
    },

    "order status flow: shipping sits between production and completed"() {
      assert.equal(canTransition("IN_PRODUCTION", "SHIPPED"), true);
      assert.equal(canTransition("SHIPPED", "COMPLETED"), true);
      assert.equal(canTransition("PAID", "SHIPPED"), false);
      assert.equal(canTransition("SHIPPED", "CANCELLED"), false);
      assert.equal(canTransition("SHIPPED", "IN_PRODUCTION"), false);
      assert.equal(canTransition("COMPLETED", "NEW"), false);
      assert.equal(canMarkShipped("IN_PRODUCTION"), true);
      assert.equal(canMarkShipped("COMPLETED"), false);
      // SHIPPED is never offered as a bare button, completing from production still is
      assert.deepEqual(plainStatusButtons("IN_PRODUCTION"), ["COMPLETED", "CANCELLED"]);
      assert.deepEqual(plainStatusButtons("SHIPPED"), ["COMPLETED"]);
    },

    "tracking validation requires a courier and a sane link"() {
      const ok = validateTracking({ carrier: " Bosta ", trackingNumber: " 123 ", trackingUrl: "https://t.bosta.co/123" });
      assert.ok(ok.ok && ok.value.carrier === "Bosta" && ok.value.trackingNumber === "123");
      const bare = validateTracking({ carrier: "Aramex", trackingNumber: "", trackingUrl: "" });
      assert.ok(bare.ok && bare.value.trackingNumber === null && bare.value.trackingUrl === null);
      assert.equal(validateTracking({ carrier: "", trackingNumber: "1", trackingUrl: "" }).ok, false);
      assert.equal(validateTracking({ carrier: "X", trackingNumber: "1", trackingUrl: "" }).ok, false);
      assert.equal(validateTracking({ carrier: "Bosta", trackingNumber: "1", trackingUrl: "javascript:alert(1)" }).ok, false);
      assert.equal(validateTracking({ carrier: "Bosta", trackingNumber: "1", trackingUrl: "not a url" }).ok, false);
    },

    "shipped email carries courier, tracking and escapes html"() {
      const mail = buildOrderShippedEmail({
        orderNumber: "TG-1", customerName: "<i>Sam</i>", carrier: "Bosta", trackingNumber: "BX-99",
        trackingUrl: "https://t.test/BX-99?a=1&b=2", addressLines: ["1 Nile St"], orderUrl: "https://x.test/orders/1", supportEmail: "hi@x.test",
      });
      assert.ok(mail.subject.includes("TG-1"));
      assert.ok(mail.text.includes("Tracking number: BX-99"));
      assert.ok(mail.text.includes("https://t.test/BX-99?a=1&b=2"));
      assert.ok(mail.html.includes("a=1&amp;b=2"));
      assert.ok(mail.html.includes("&lt;i&gt;Sam&lt;/i&gt;"));
    },

    "legal body parser: headings, lists, bold, paragraphs; never raw html"() {
      const blocks = parseLegalBody("## Title\n\nFirst line\nsecond **bold** line\n\n- one\n- two **b**\n\n### Sub\n<script>alert(1)</script>");
      assert.deepEqual(blocks.map((b) => b.type), ["h2", "p", "ul", "h3", "p"]);
      const para = blocks[1];
      assert.ok(para.type === "p" && para.inline.some((i) => i.bold && i.text === "bold"));
      assert.ok(para.type === "p" && para.inline.map((i) => i.text).join("") === "First line second bold line");
      const list = blocks[2];
      assert.ok(list.type === "ul" && list.items.length === 2);
      // markup is kept as inert text for React to escape, never interpreted
      const last = blocks[4];
      assert.ok(last.type === "p" && last.inline[0].text === "<script>alert(1)</script>");
    },

    "legal placeholders, slugs and page validation"() {
      assert.deepEqual(findPlaceholders("in [PRODUCTION TIME] and [7 DAYS] but not [x] or [lower case words here]"), ["[PRODUCTION TIME]", "[7 DAYS]"]);
      assert.equal(isLegalSlug("terms"), true);
      assert.equal(isLegalSlug("../etc"), false);
      assert.equal(legalPageProblem({ title: "Terms", body: "x".repeat(60) }), null);
      assert.ok(legalPageProblem({ title: "T", body: "x".repeat(60) }));
      assert.ok(legalPageProblem({ title: "Terms", body: "short" }));
      assert.ok(legalPageProblem({ title: "Terms", body: "x".repeat(40_001) }));
    },

    "site header: admin hidden, studio tabs per project, active link, auth variants"() {
      assert.equal(headerHidden("/admin"), true);
      assert.equal(headerHidden("/admin/orders"), true);
      assert.equal(headerHidden("/administrator"), false);
      assert.equal(studioProjectId("/studio/projects/abc123/builder"), "abc123");
      assert.equal(studioProjectId("/studio/projects/new"), null);
      assert.equal(studioProjectId("/studio/projects"), null);

      const home = buildNavModel("/", false);
      assert.deepEqual(home.left.map((l) => l.label), ["Home", "Portfolio", "Contact"]);
      assert.equal(home.left[0].active, true);
      assert.equal(home.studio?.label, "Enter studio");
      assert.equal(home.bagLink.label, "My bag");
      assert.equal(home.bagLink.active, false);
      assert.equal(buildNavModel("/bag", true).bagLink.active, true);
      assert.equal(home.showLogin, true);
      assert.deepEqual(home.accountItems, []);

      const contact = buildNavModel("/contact", false);
      assert.equal(contact.left.find((l) => l.label === "Contact")?.active, true);
      assert.equal(contact.left.find((l) => l.label === "Home")?.active, false);

      const builder = buildNavModel("/studio/projects/p1/builder", true);
      assert.deepEqual(builder.left.map((l) => l.label), ["Home", "Builder"]);
      assert.equal(builder.left[1].href, "/studio/projects/p1/builder");
      assert.equal(builder.left[1].active, true);
      // inside the Studio "Enter studio" would be redundant, and Wishlist /
      // My projects live in the dropdown only (no duplicates in the bar)
      assert.equal(builder.studio, null);
      assert.equal(builder.bagLink.href, "/bag");
      assert.deepEqual(builder.accountItems.map((i) => i.label), ["My orders", "Wishlist", "My projects", "Bespoke"]);
      assert.equal(builder.accountItems.find((i) => i.label === "Bespoke")?.href, "/bespoke");
      assert.equal(buildNavModel("/bespoke", true).accountItems.find((i) => i.label === "Bespoke")?.active, true);
      assert.equal(builder.showLogin, false);
      // admin dashboard is the FIRST entry of the account dropdown, for admins only
      assert.equal(buildNavModel("/", true, "ADMIN").accountItems[0].href, "/admin");
      assert.ok(!buildNavModel("/", true, "USER").accountItems.some((i) => i.href === "/admin"));
      assert.deepEqual(buildNavModel("/", false, "ADMIN").accountItems, []);

      assert.equal(buildNavModel("/wishlist", true).left.length, 3);
      assert.ok(!buildNavModel("/studio/projects/p1/builder", true).left.some((l) => l.label === "Bespoke"));
      for (const path of ["/", "/contact", "/studio/projects/p1/builder"]) {
        const m = buildNavModel(path, true, "ADMIN");
        const inBar = [...m.left, ...(m.studio ? [m.studio] : []), m.bagLink].map((l) => l.href);
        for (const item of m.accountItems) assert.ok(!inBar.includes(item.href), `${item.href} duplicated in the bar on ${path}`);
      }
      assert.equal(buildNavModel("/login", false).authLink?.label, "Create account");
      assert.equal(buildNavModel("/register", false).authLink?.label, "Login");
      assert.equal(buildNavModel("/forgot-password", false).authLink?.label, "Login");
      // a signed-in visitor on an auth page still gets the normal LOGOUT slot
      assert.equal(buildNavModel("/login", true).showLogin, false);
      assert.equal(buildNavModel("/login", false).showLogin, false);

      assert.equal(displayNameFromEmail("tarekelfanty@gmail.com"), "Tarekelfanty");
      assert.equal(displayNameFromEmail("tarek.elfanty_92@x.co"), "Tarek Elfanty");
      assert.equal(displayNameFromEmail("a.b.c.d@x.co"), "A B");
      assert.equal(displayNameFromEmail("12345@x.co"), "Account");
      assert.equal(displayNameFromEmail(null), "Account");
      assert.equal(avatarInitial("tarekelfanty@gmail.com"), "T");
      assert.equal(avatarInitial("12345@x.co"), "1");
    },

    "bag: sizes normalise like checkout and checkout links are safe"() {
      assert.equal(normalizeBagSize("XL"), "XL");
      assert.equal(normalizeBagSize("xxl"), "M");
      assert.equal(normalizeBagSize(undefined), "M");
      assert.equal(checkoutHref("b1", "L"), "/checkout?buildId=b1&size=L");
      assert.equal(checkoutHref("a&b=c", "bogus"), "/checkout?buildId=a%26b%3Dc&size=M");
    },

    "order item extras: size, notes and saved artwork come from the frozen snapshot"() {
      assert.deepEqual(orderItemExtras({ size: "L", notes: "  soft print ", savedArtworkId: "art_1" }), { size: "L", notes: "soft print", savedArtworkId: "art_1" });
      assert.deepEqual(orderItemExtras({ size: "", notes: null }), { size: null, notes: null, savedArtworkId: null });
      assert.deepEqual(orderItemExtras(null), { size: null, notes: null, savedArtworkId: null });
      assert.deepEqual(orderItemExtras("junk"), { size: null, notes: null, savedArtworkId: null });
      assert.equal(orderItemExtras({ size: 5 }).size, null);
    },

    "EXPECTED_LATEST_MIGRATION matches the newest folder in prisma/migrations"() {
      const dirs = readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      assert.equal(EXPECTED_LATEST_MIGRATION, dirs[dirs.length - 1], "update src/lib/admin/expected-migration.ts when adding a migration");
    },

    "migration skew detection: behind, ahead, equal"() {
      assert.equal(compareMigrations("20261013200000_x", "20261013200000_x"), "ok");
      assert.equal(compareMigrations("20261012170000_a", "20261013200000_x"), "db-behind");
      assert.equal(compareMigrations("20261014000000_new", "20261013200000_x"), "db-ahead");
      assert.equal(compareMigrations(null, "20261013200000_x"), "db-behind");
    },

  });
}
