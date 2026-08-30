// file: src/lib/notify/__tests__/bespoke.test.ts
import assert from "node:assert/strict";
import {
  buildBespokeCustomerEmail,
  buildBespokeOpsMessage,
  bespokeConfigLines,
  type BespokeNotifyView,
} from "../bespoke-content";
import { runSuite } from "../../../testing/test-harness";

const view: BespokeNotifyView = {
  requestNumber: "TGFM-BSPK-XYZ-001",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+201001234567",
  product: "CUSTOM",
  color: "BLACK",
  fabric: "SIGNATURE_200",
  quantity: 25,
  size: "L",
  placements: ["FULL_FRONT", "CENTER_BACK"],
  customNotes: "Foil print please",
  createdAt: new Date("2026-08-30T10:00:00.000Z"),
};

export async function runAll() {
  return runSuite("lib/notify/bespoke-content", {
    "customer email carries the request number and contact details"() {
      const email = buildBespokeCustomerEmail(view);
      assert.ok(email.subject.includes("TGFM-BSPK-XYZ-001"));
      assert.ok(email.text.includes("Jane Doe"));
      assert.ok(email.text.includes("jane@example.com"));
      assert.ok(email.text.includes("+201001234567"));
      assert.ok(email.html.includes("TGFM-BSPK-XYZ-001"));
      assert.ok(/no payment/i.test(email.text));
    },

    "config lines list every selection"() {
      const lines = bespokeConfigLines(view).join("\n");
      assert.ok(lines.includes("Product: CUSTOM"));
      assert.ok(lines.includes("Colour: BLACK"));
      assert.ok(lines.includes("Fabric: SIGNATURE_200"));
      assert.ok(lines.includes("Quantity: 25"));
      assert.ok(lines.includes("Size: L"));
      assert.ok(lines.includes("FULL_FRONT, CENTER_BACK"));
      assert.ok(lines.includes("Foil print please"));
    },

    "ops message is a plain string with the request number and customer"() {
      const msg = buildBespokeOpsMessage(view);
      assert.ok(msg.startsWith("New bespoke request TGFM-BSPK-XYZ-001"));
      assert.ok(msg.includes("jane@example.com"));
    },

    "builders are pure (no throw, stable output)"() {
      const a = buildBespokeOpsMessage(view);
      const b = buildBespokeOpsMessage(view);
      assert.equal(a, b);
    },

    "handles missing optional fields without crashing"() {
      const sparse: BespokeNotifyView = {
        ...view,
        color: null,
        fabric: null,
        size: null,
        placements: [],
        customNotes: null,
      };
      const email = buildBespokeCustomerEmail(sparse);
      assert.ok(email.text.includes("Colour: —"));
      assert.ok(!email.text.includes("Notes:"));
    },
  });
}
