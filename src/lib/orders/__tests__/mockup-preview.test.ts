// file: src/lib/orders/__tests__/mockup-preview.test.ts
// Feedback 8.1: Bag / Wishlist / Orders / Checkout show the customer's own mockup only when it matches the design
// as it is now; otherwise the plain garment in the right cut and colour.
import assert from "node:assert/strict";
import { designPreviewUrl, freshMockupId, freshMockupPointers, orderItemPreviewUrl, plainGarmentImage } from "../../mockup-preview";
import { sideFingerprint, type ArtworkLayer } from "../../../studio/artwork-layers";
import { BASELINE_RENDER_DPI } from "../../../studio/render/transform";
import { runSuite } from "../../../testing/test-harness";

const layers: ArtworkLayer[] = [{ placement: "CENTER_FRONT", assetId: "asset-1", x: 0, y: 0, scale: 1, rotation: 0 }];
const fp = (product: string, color: string, l: ArtworkLayer[] = layers) =>
  sideFingerprint({ layers: l, product, color, dpi: BASELINE_RENDER_DPI });

export async function runAll() {
  return runSuite("lib/mockup-preview (8.1)", {
    "a mockup whose fingerprint matches the design is used"() {
      const draft = { product: "OVERSIZED", color: "BLACK", artworkLayers: layers, aiMockupId: "m1", aiMockupFingerprint: fp("OVERSIZED", "BLACK") };
      assert.equal(freshMockupId(draft, layers), "m1");
      assert.equal(designPreviewUrl(draft, layers), "/api/mockups/m1/file");
    },
    "a mockup made for another colour or cut is NOT used: plain garment of the current cut and colour"() {
      const stale = { product: "OVERSIZED", color: "BLACK", artworkLayers: layers, aiMockupId: "m1", aiMockupFingerprint: fp("FITTED", "WHITE") };
      assert.equal(freshMockupId(stale, layers), null);
      assert.equal(designPreviewUrl(stale, layers), "/images/Oversized Black.png");
      assert.equal(plainGarmentImage("FITTED", "WHITE"), "/images/TGFM White.png");
    },
    "a mockup of different artwork is NOT used"() {
      const other: ArtworkLayer[] = [{ ...layers[0], assetId: "asset-2" }];
      const draft = { product: "FITTED", color: "WHITE", artworkLayers: layers, printMockupId: "p1", printMockupFingerprint: fp("FITTED", "WHITE", other) };
      assert.equal(freshMockupId(draft, layers), null);
    },
    "no artwork means no mockup is used"() {
      assert.equal(freshMockupId({ product: "FITTED", color: "WHITE", aiMockupId: "m1", aiMockupFingerprint: "x" }, []), null);
      assert.equal(designPreviewUrl({ product: "FITTED", color: "BLACK" }, []), "/images/TGFM Black.png");
    },
    "an order item uses its frozen mockup only when its fingerprint matches the item's own design"() {
      const item = { product: "OVERSIZED", color: "BLACK", preview: {} };
      const good = new Map([["m1", fp("OVERSIZED", "BLACK")]]);
      assert.equal(orderItemPreviewUrl(item, { aiMockupId: "m1", printMockupId: null }, good, layers), "/api/mockups/m1/file");
      const bad = new Map([["m1", fp("FITTED", "WHITE")]]);
      assert.equal(orderItemPreviewUrl(item, { aiMockupId: "m1", printMockupId: null }, bad, layers), "/images/Oversized Black.png");
    },
    "an order never records a mockup of a different colour, cut or artwork"() {
      const draft = { product: "OVERSIZED", color: "BLACK", aiMockupId: "m1", aiMockupFingerprint: fp("FITTED", "WHITE"), printMockupId: "p1", printMockupFingerprint: fp("OVERSIZED", "BLACK") };
      const pointers = freshMockupPointers(draft, layers);
      assert.equal(pointers.aiMockupId, null);
      assert.equal(pointers.printMockupId, "p1");
    },
  });
}
