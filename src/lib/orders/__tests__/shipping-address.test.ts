// file: src/lib/orders/__tests__/shipping-address.test.ts
import assert from "node:assert/strict";
import { validateShippingAddress, CustomerValidationError } from "../customer";
import { formatShippingAddress, productDisplayName } from "../display";
import { composeInternationalPhone, COUNTRIES, findCountry } from "../../geo/countries";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/orders/shipping-address", {
    "accepts and normalises a complete address"() {
      const out = validateShippingAddress({
        country: "eg",
        line1: "  12 Tahrir St  ",
        line2: "",
        city: "Cairo",
        region: "",
        postalCode: "11511",
      });
      assert.deepEqual(out, {
        country: "EG",
        line1: "12 Tahrir St",
        line2: "",
        city: "Cairo",
        region: "",
        postalCode: "11511",
      });
    },

    "rejects an unknown country, missing street or missing city"() {
      const isValidationError = (e: unknown) => e instanceof CustomerValidationError;
      assert.throws(() => validateShippingAddress({ country: "ZZ", line1: "12 St", city: "Cairo" }), isValidationError);
      assert.throws(() => validateShippingAddress({ country: "EG", line1: "", city: "Cairo" }), isValidationError);
      assert.throws(() => validateShippingAddress({ country: "EG", line1: "12 St", city: "" }), isValidationError);
      assert.throws(() => validateShippingAddress(null), isValidationError);
    },

    "country list has unique ISO codes and numeric dial codes"() {
      assert.equal(new Set(COUNTRIES.map((c) => c.code)).size, COUNTRIES.length);
      for (const c of COUNTRIES) assert.match(c.dial, /^[0-9]{1,4}$/, c.code);
      assert.equal(findCountry("gb")?.dial, "44");
    },

    "composes E.164 phone numbers, dropping a national trunk zero"() {
      assert.equal(composeInternationalPhone("20", "010 0123 4567"), "+201001234567");
      assert.equal(composeInternationalPhone("44", "07911 123456"), "+447911123456");
      assert.equal(composeInternationalPhone("39", "06 1234 5678"), "+390612345678");
      assert.equal(composeInternationalPhone("20", ""), "");
    },

    "derives the customer-facing product name"() {
      assert.equal(productDisplayName({ product: "CUSTOM" }), "Bespoke T-shirt");
      assert.equal(productDisplayName({ product: "FITTED", primaryAssetId: "a1" }), "Customised T-shirt");
      assert.equal(productDisplayName({ product: "OVERSIZED", printMockupId: "m1" }), "Customised T-shirt");
      assert.equal(productDisplayName({ product: "FITTED" }), "Plain T-shirt");
    },

    "formats an address for admin views"() {
      assert.deepEqual(
        formatShippingAddress({
          shippingAddressLine1: "12 Tahrir St",
          shippingAddressLine2: null,
          shippingCity: "Cairo",
          shippingRegion: null,
          shippingPostalCode: "11511",
          shippingCountry: "EG",
        }),
        ["12 Tahrir St", "Cairo, 11511", "EG"],
      );
    },
  });
}
