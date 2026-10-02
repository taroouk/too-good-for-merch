// file: src/lib/orders/__tests__/reuse-layers.test.ts
import assert from "node:assert/strict";
import { buildDesignSignature, designSignaturesMatch, type SignatureLayer } from "../reuse";
import { runSuite } from "../../../testing/test-harness";

const base = {
  product: "FITTED",
  fabric: "SIGNATURE_200",
  color: "WHITE",
  quantity: 1,
  size: "M",
  primaryAssetId: "a1",
  placements: ["FULL_FRONT", "LEFT_CHEST"],
  transform: { placement: "FULL_FRONT", x: 0, y: 0, scale: 1, rotation: 0 },
};
const L = (placement: string, assetId: string, x = 0): SignatureLayer => ({ placement, assetId, x, y: 0, scale: 1, rotation: 0 });

export async function runAll() {
  return runSuite("lib/orders/reuse-layers", {
    "identical multi-artwork designs match, in any layer order"() {
      const a = buildDesignSignature({ ...base, layers: [L("FULL_FRONT", "a1"), L("LEFT_CHEST", "a2")] });
      const b = buildDesignSignature({ ...base, layers: [L("LEFT_CHEST", "a2"), L("FULL_FRONT", "a1")] });
      assert.equal(designSignaturesMatch(a, b), true);
    },

    "moving, swapping or removing any one artwork breaks the match"() {
      const a = buildDesignSignature({ ...base, layers: [L("FULL_FRONT", "a1"), L("LEFT_CHEST", "a2")] });
      for (const layers of [
        [L("FULL_FRONT", "a1"), L("LEFT_CHEST", "a2", 0.01)],
        [L("FULL_FRONT", "a1"), L("LEFT_CHEST", "a3")],
        [L("FULL_FRONT", "a1")],
      ]) {
        assert.equal(designSignaturesMatch(a, buildDesignSignature({ ...base, layers })), false);
      }
    },

    "an order from before layers matches a one-artwork design, never a multi-artwork one"() {
      const legacy = { ...buildDesignSignature(base), layers: undefined };
      assert.equal(designSignaturesMatch(legacy, buildDesignSignature({ ...base, layers: [L("FULL_FRONT", "a1")] })), true);
      assert.equal(
        designSignaturesMatch(legacy, buildDesignSignature({ ...base, layers: [L("FULL_FRONT", "a1"), L("LEFT_CHEST", "a2")] })),
        false,
      );
    },
  });
}
