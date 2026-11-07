import assert from "node:assert/strict";
import { artworkKindNotice, classifyArtwork } from "../artwork-kind";
import { runSuite } from "../../testing/test-harness";

function rgba(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(px(x, y), (y * w + x) * 4);
  return d;
}

export async function runAll() {
  return runSuite("studio/artwork-kind", {
    "a transparent PNG (design on a see-through background) is transparent, not white-background"() {
      const d = rgba(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? [200, 20, 20, 255] : [0, 0, 0, 0]));
      assert.deepEqual(classifyArtwork(d, 40, 40), { transparent: true, whiteBackground: false });
    },
    "an opaque picture with a white background is flagged (a JPG has no alpha channel at all)"() {
      const png = rgba(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? [10, 10, 10, 255] : [255, 255, 255, 255]));
      assert.deepEqual(classifyArtwork(png, 40, 40), { transparent: false, whiteBackground: true });
      const jpg = new Uint8Array(40 * 40 * 3).fill(255); // RGB only
      for (let y = 15; y < 25; y++) for (let x = 15; x < 25; x++) jpg.fill(0, (y * 40 + x) * 3, (y * 40 + x) * 3 + 3);
      assert.deepEqual(classifyArtwork(jpg, 40, 40, 3), { transparent: false, whiteBackground: true });
    },
    "an opaque picture with a coloured background is just opaque"() {
      const d = rgba(40, 40, () => [30, 60, 160, 255]);
      assert.deepEqual(classifyArtwork(d, 40, 40), { transparent: false, whiteBackground: false });
    },
    "a transparent PNG whose corners are the only see-through part still counts as transparent"() {
      const d = rgba(100, 100, (x, y) => ((x < 6 && y < 6) || (x > 93 && y > 93) ? [0, 0, 0, 0] : [255, 255, 255, 255]));
      const k = classifyArtwork(d, 100, 100);
      assert.equal(k.transparent, true);
    },
    "the wording distinguishes the three cases"() {
      assert.match(artworkKindNotice({ transparent: true, whiteBackground: false }), /Transparent background/);
      assert.match(artworkKindNotice({ transparent: false, whiteBackground: false }), /Opaque image/);
      assert.match(artworkKindNotice({ transparent: false, whiteBackground: true }), /white background/i);
    },
  });
}
