// file: src/lib/orders/__tests__/customer.test.ts
import assert from "node:assert/strict";
import { validateCustomer, CustomerValidationError, cleanText } from "../customer";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/orders/customer", {
    "accepts a well-formed customer and normalises it"() {
      const out = validateCustomer({
        name: "  Jane Doe  ",
        email: "JANE@Example.COM",
        phone: "+20 (100) 123-4567",
      });
      assert.deepEqual(out, {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "+201001234567",
      });
    },

    "rejects a too-short name"() {
      assert.throws(
        () => validateCustomer({ name: "J", email: "a@b.co", phone: "+201001234567" }),
        (e: unknown) => e instanceof CustomerValidationError && (e as Error).message.includes("full name"),
      );
    },

    "rejects an invalid email"() {
      assert.throws(
        () => validateCustomer({ name: "Jane Doe", email: "not-an-email", phone: "+201001234567" }),
        CustomerValidationError,
      );
    },

    "rejects a phone without enough digits"() {
      assert.throws(
        () => validateCustomer({ name: "Jane Doe", email: "a@b.co", phone: "12345" }),
        CustomerValidationError,
      );
    },

    "CustomerValidationError carries a 400 status"() {
      try {
        validateCustomer({ name: "", email: "", phone: "" });
        assert.fail("should have thrown");
      } catch (e) {
        assert.equal((e as CustomerValidationError).status, 400);
      }
    },

    "cleanText trims and truncates"() {
      assert.equal(cleanText("  hello world  ", 5), "hello");
      assert.equal(cleanText(12345, 5), "");
    },
  });
}
