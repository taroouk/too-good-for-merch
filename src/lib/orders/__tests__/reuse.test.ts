// file: src/lib/orders/__tests__/reuse.test.ts
// Regression tests for P1-7 (stale order reuse). See src/lib/orders/reuse.ts.
import assert from "node:assert/strict";
import { buildDesignSignature, canReuseOrder } from "../reuse";
import { runSuite } from "../../../testing/test-harness";

const baseInput = {
  product: "FITTED",
  fabric: "COTTON",
  color: "BLACK",
  quantity: 1,
  size: "M",
  primaryAssetId: "asset_1",
  placements: ["CENTER_FRONT"],
  transform: { placement: "CENTER_FRONT", x: 0, y: 0, scale: 1, rotation: 0 },
};

function candidateFrom(overrides: Partial<typeof baseInput>) {
  const signature = buildDesignSignature({ ...baseInput, ...overrides });
  return { currency: "EGP", totalCents: 10000, signature };
}

export async function runAll() {
  return runSuite("lib/orders/reuse", {
    "same build/design -> reuse is safe"() {
      const signature = buildDesignSignature(baseInput);
      const reusable = canReuseOrder({
        existing: { currency: "EGP", totalCents: 10000, existingSignature: signature },
        candidate: { currency: "EGP", totalCents: 10000, signature },
      });
      assert.equal(reusable, true);
    },

    "changed artwork -> stale order not reused"() {
      const existingSignature = buildDesignSignature(baseInput);
      const candidate = candidateFrom({ primaryAssetId: "asset_2" });
      const reusable = canReuseOrder({
        existing: { currency: "EGP", totalCents: 10000, existingSignature },
        candidate,
      });
      assert.equal(reusable, false);
    },

    "a new mockup or saved artwork (same price/size) -> stale order not reused"() {
      const existingSignature = buildDesignSignature({ ...baseInput, printMockupId: "m1", aiMockupId: "m2", savedArtworkId: "art1" });
      const reuse = (overrides: Record<string, string | null>) =>
        canReuseOrder({
          existing: { currency: "EGP", totalCents: 10000, existingSignature },
          candidate: { currency: "EGP", totalCents: 10000, signature: buildDesignSignature({ ...baseInput, printMockupId: "m1", aiMockupId: "m2", savedArtworkId: "art1", ...overrides }) },
        });
      assert.equal(reuse({}), true);
      assert.equal(reuse({ printMockupId: "m9" }), false);
      assert.equal(reuse({ aiMockupId: "m9" }), false);
      assert.equal(reuse({ savedArtworkId: "art2" }), false);
      assert.equal(reuse({ backPrintMockupId: "b1" }), false);
      assert.equal(reuse({ backAiMockupId: "b1" }), false);
    },

    "an older order with no mockup fields only matches a design that also has none"() {
      const legacy = buildDesignSignature(baseInput); // as stored before these fields existed
      const stripped = { ...legacy } as Record<string, unknown>;
      delete stripped.printMockupId; delete stripped.aiMockupId; delete stripped.savedArtworkId;
      delete stripped.backPrintMockupId; delete stripped.backAiMockupId;
      const reuse = (signature: ReturnType<typeof buildDesignSignature>) =>
        canReuseOrder({
          existing: { currency: "EGP", totalCents: 10000, existingSignature: stripped as ReturnType<typeof buildDesignSignature> },
          candidate: { currency: "EGP", totalCents: 10000, signature },
        });
      assert.equal(reuse(buildDesignSignature(baseInput)), true);
      assert.equal(reuse(buildDesignSignature({ ...baseInput, printMockupId: "m1" })), false);
    },

    "changed color -> stale order not reused"() {
      const existingSignature = buildDesignSignature(baseInput);
      const candidate = candidateFrom({ color: "WHITE" });
      const reusable = canReuseOrder({
        existing: { currency: "EGP", totalCents: 10000, existingSignature },
        candidate,
      });
      assert.equal(reusable, false);
    },

    "changed size -> stale order not reused"() {
      const existingSignature = buildDesignSignature(baseInput);
      const candidate = candidateFrom({ size: "L" });
      const reusable = canReuseOrder({
        existing: { currency: "EGP", totalCents: 10000, existingSignature },
        candidate,
      });
      assert.equal(reusable, false);
    },

    "changed transform (drag/scale) -> stale order not reused"() {
      const existingSignature = buildDesignSignature(baseInput);
      const candidate = candidateFrom({
        transform: { placement: "CENTER_FRONT", x: 0.5, y: 0, scale: 1, rotation: 0 },
      });
      const reusable = canReuseOrder({
        existing: { currency: "EGP", totalCents: 10000, existingSignature },
        candidate,
      });
      assert.equal(reusable, false);
    },

    "payment retry on an unmodified build -> existing valid order remains reusable"() {
      const signature = buildDesignSignature(baseInput);
      // Simulates re-submitting checkout for the same build after a failed
      // payment attempt: price/currency/design are all still identical.
      const reusable = canReuseOrder({
        existing: { currency: "EGP", totalCents: 10000, existingSignature: signature },
        candidate: { currency: "EGP", totalCents: 10000, signature: buildDesignSignature(baseInput) },
      });
      assert.equal(reusable, true);
    },

    "no existing order -> never reusable"() {
      const reusable = canReuseOrder({
        existing: null,
        candidate: { currency: "EGP", totalCents: 10000, signature: buildDesignSignature(baseInput) },
      });
      assert.equal(reusable, false);
    },

    "placements order doesn't matter for the signature comparison"() {
      const a = buildDesignSignature({ ...baseInput, placements: ["CENTER_FRONT", "LEFT_CHEST"] });
      const b = buildDesignSignature({ ...baseInput, placements: ["LEFT_CHEST", "CENTER_FRONT"] });
      const reusable = canReuseOrder({
        existing: { currency: "EGP", totalCents: 10000, existingSignature: a },
        candidate: { currency: "EGP", totalCents: 10000, signature: b },
      });
      assert.equal(reusable, true);
    },
  });
}
