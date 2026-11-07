// file: src/lib/orders/__tests__/draft-placements.test.ts
import assert from "node:assert/strict";
import { draftPricedPlacements } from "../draft-placements";
import { runSuite } from "../../../testing/test-harness";

const layer = (placement: string, assetId = "a1") => ({ placement, assetId, x: 0, y: 0, scale: 1, rotation: 0 });

export async function runAll() {
  return runSuite("lib/orders/draft-placements (price placements come from the saved design)", {
    "the placements of the saved artwork layers are priced, in layer order, without duplicates"() {
      const placements = draftPricedPlacements({ artworkLayers: [layer("CENTER_FRONT"), layer("RIGHT_CHEST", "a2"), layer("CENTER_FRONT", "a3")] });
      assert.deepEqual(placements, ["CENTER_FRONT", "RIGHT_CHEST"]);
    },

    "layers win over stale placement notes (the notes can lag behind the design)"() {
      const placements = draftPricedPlacements({ artworkLayers: [layer("FULL_BACK")], customNotes: JSON.stringify({ placements: ["CENTER_FRONT"] }) });
      assert.deepEqual(placements, ["FULL_BACK"]);
    },

    "a legacy single artwork (primary asset + placement) counts as one layer"() {
      const placements = draftPricedPlacements({ primaryAssetId: "a1", artworkPlacement: { placement: "LEFT_CHEST", x: 0, y: 0, scale: 1 } });
      assert.deepEqual(placements, ["LEFT_CHEST"]);
    },

    "no artwork: the placements recorded in the notes, then the default"() {
      assert.deepEqual(draftPricedPlacements({ customNotes: JSON.stringify({ placements: ["LEFT_CHEST", "RIGHT_CHEST"] }) }), ["LEFT_CHEST", "RIGHT_CHEST"]);
      assert.deepEqual(draftPricedPlacements({ customNotes: "PLACEMENTS=FULL_FRONT" }), ["FULL_FRONT"]);
      assert.deepEqual(draftPricedPlacements({}), ["CENTER_FRONT"]);
      assert.deepEqual(draftPricedPlacements({ artworkLayers: "garbage", customNotes: "???" }), ["CENTER_FRONT"]);
    },

    "the function has no way to take client-supplied placements (a tampered request cannot change the result)"() {
      assert.equal(draftPricedPlacements.length, 1);
      const draft = { artworkLayers: [layer("CENTER_FRONT"), layer("RIGHT_CHEST", "a2")] };
      // Whatever extra data is attached to the input, only the saved design counts.
      const tampered = { ...draft, placements: ["CENTER_FRONT"], requestedPlacements: [] } as typeof draft;
      assert.deepEqual(draftPricedPlacements(tampered), ["CENTER_FRONT", "RIGHT_CHEST"]);
    },
  });
}
