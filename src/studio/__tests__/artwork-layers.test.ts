// file: src/studio/__tests__/artwork-layers.test.ts
import assert from "node:assert/strict";
import {
  MAX_ARTWORK_LAYERS,
  draftArtworkLayers,
  layersForSide,
  normalizeArtworkLayers,
  sideFingerprint,
  sidesWithLayers,
  type ArtworkLayer,
} from "../artwork-layers";
import { computeMockupFingerprint } from "../mockup-fingerprint";
import { runSuite } from "../../testing/test-harness";

const layer = (placement: ArtworkLayer["placement"], assetId = "a1", x = 0): ArtworkLayer => ({
  placement,
  assetId,
  x,
  y: 0,
  scale: 1,
  rotation: 0,
});

export async function runAll() {
  return runSuite("studio/artwork-layers", {
    "normalize keeps one layer per placement, known placements only, at most four"() {
      const out = normalizeArtworkLayers([
        layer("FULL_FRONT", "a1"),
        layer("FULL_FRONT", "a2"),
        { placement: "NOPE", assetId: "x" },
        { placement: "LEFT_CHEST" },
        layer("LEFT_CHEST", "a3"),
        layer("RIGHT_CHEST", "a4"),
        layer("FULL_BACK", "a5"),
        layer("CENTER_BACK", "a6"),
      ]);
      assert.equal(out.length, MAX_ARTWORK_LAYERS);
      assert.deepEqual(out.map((l) => l.placement), ["FULL_FRONT", "LEFT_CHEST", "RIGHT_CHEST", "FULL_BACK"]);
      assert.equal(out[0].assetId, "a1");
    },

    "normalize defaults missing transform fields"() {
      const [only] = normalizeArtworkLayers([{ placement: "CENTER_FRONT", assetId: " a1 " }]);
      assert.deepEqual(only, { placement: "CENTER_FRONT", assetId: "a1", x: 0, y: 0, scale: 1, rotation: 0 });
      assert.deepEqual(normalizeArtworkLayers("nope"), []);
    },

    "a legacy single-artwork draft reads as one layer"() {
      assert.deepEqual(
        draftArtworkLayers({
          artworkLayers: null,
          primaryAssetId: "a1",
          artworkPlacement: { placement: "LEFT_CHEST", x: 0.1, y: -0.05, scale: 1.2, rotation: 3 },
        }),
        [{ placement: "LEFT_CHEST", assetId: "a1", x: 0.1, y: -0.05, scale: 1.2, rotation: 3 }],
      );
      assert.deepEqual(draftArtworkLayers({ artworkLayers: null, primaryAssetId: null }), []);
      // artworkLayers wins over the legacy mirror when present.
      assert.equal(
        draftArtworkLayers({ artworkLayers: [layer("FULL_BACK", "b1")], primaryAssetId: "a1" })[0].placement,
        "FULL_BACK",
      );
    },

    "layers split by garment side"() {
      const layers = [layer("FULL_FRONT"), layer("FULL_BACK", "b"), layer("LEFT_CHEST", "c")];
      assert.deepEqual(layersForSide(layers, "front").map((l) => l.placement), ["FULL_FRONT", "LEFT_CHEST"]);
      assert.deepEqual(layersForSide(layers, "back").map((l) => l.placement), ["FULL_BACK"]);
      assert.deepEqual(sidesWithLayers(layers), ["front", "back"]);
      assert.deepEqual(sidesWithLayers([layer("CENTER_BACK")]), ["back"]);
    },

    "a one-artwork side fingerprints exactly like the old single-artwork fingerprint"() {
      const l = { ...layer("CENTER_FRONT", "a1", 0.05), y: -0.02, scale: 1.1, rotation: 2 };
      const legacy = computeMockupFingerprint({
        assetId: "a1",
        placement: "CENTER_FRONT",
        x: 0.05,
        y: -0.02,
        scale: 1.1,
        product: "FITTED",
        color: "WHITE",
        rotation: 2,
        dpi: 150,
      });
      assert.equal(sideFingerprint({ layers: [l], product: "FITTED", color: "WHITE", dpi: 150 }), legacy);
    },

    "a multi-artwork fingerprint changes with any layer and ignores order"() {
      const a = layer("FULL_FRONT", "a1");
      const b = layer("LEFT_CHEST", "a2");
      const base = sideFingerprint({ layers: [a, b], product: "FITTED", color: "WHITE" });
      assert.equal(sideFingerprint({ layers: [b, a], product: "FITTED", color: "WHITE" }), base);
      assert.notEqual(sideFingerprint({ layers: [a, { ...b, x: 0.01 }], product: "FITTED", color: "WHITE" }), base);
      assert.notEqual(sideFingerprint({ layers: [a], product: "FITTED", color: "WHITE" }), base);
      assert.equal(sideFingerprint({ layers: [], product: "FITTED", color: "WHITE" }), null);
    },
  });
}
