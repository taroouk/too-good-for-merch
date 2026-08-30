// file: src/lib/bespoke/__tests__/snapshot.test.ts
import assert from "node:assert/strict";
import { buildRequestSnapshot, generateRequestNumber, normalizeSize } from "../snapshot";
import { runSuite } from "../../../testing/test-harness";

const draft = {
  product: "CUSTOM",
  color: "BLACK",
  fabric: "SIGNATURE_200",
  quantity: 12,
  customNotes: JSON.stringify({ placements: ["FULL_FRONT", "CENTER_BACK"] }),
  artworkPlacement: { placement: "FULL_FRONT", x: 0.1, y: -0.2, scale: 1.3, rotation: 0 },
};

const contact = { name: "Jane Doe", email: "jane@example.com", phone: "+201001234567" };

export async function runAll() {
  return runSuite("lib/bespoke/snapshot", {
    "carries every Builder selection and the exact artworkId"() {
      const snap = buildRequestSnapshot({ draft, contact, size: "L", artworkId: "art_123" });
      assert.equal(snap.product, "CUSTOM");
      assert.equal(snap.color, "BLACK");
      assert.equal(snap.fabric, "SIGNATURE_200");
      assert.equal(snap.quantity, 12);
      assert.equal(snap.size, "L");
      assert.deepEqual(snap.placements, ["FULL_FRONT", "CENTER_BACK"]);
      assert.equal(snap.artworkId, "art_123");
      assert.deepEqual(snap.transform, {
        placement: "FULL_FRONT",
        x: 0.1,
        y: -0.2,
        scale: 1.3,
        rotation: 0,
      });
      assert.equal(snap.customerEmail, "jane@example.com");
    },

    "prefers explicitly requested placements over the draft notes"() {
      const snap = buildRequestSnapshot({
        draft,
        contact,
        artworkId: null,
        requestedPlacements: ["LEFT_CHEST"],
      });
      assert.deepEqual(snap.placements, ["LEFT_CHEST"]);
    },

    "falls back to a default placement when nothing is set"() {
      const snap = buildRequestSnapshot({
        draft: { ...draft, customNotes: null, artworkPlacement: null },
        contact,
        artworkId: null,
      });
      assert.ok(snap.placements.length >= 1);
      assert.equal(snap.transform, null);
    },

    "clamps a nonsense quantity to a sane value"() {
      const snap = buildRequestSnapshot({
        draft: { ...draft, quantity: -5 as unknown as number },
        contact,
        artworkId: null,
      });
      assert.equal(snap.quantity, 1);
    },

    "normalizeSize only accepts known sizes"() {
      assert.equal(normalizeSize("M"), "M");
      assert.equal(normalizeSize("XXL"), null);
      assert.equal(normalizeSize(42), null);
    },

    "generateRequestNumber is prefixed and unique-ish"() {
      const a = generateRequestNumber(1_700_000_000_000);
      assert.ok(a.startsWith("TGFM-BSPK-"));
      assert.notEqual(generateRequestNumber(), generateRequestNumber());
    },
  });
}
