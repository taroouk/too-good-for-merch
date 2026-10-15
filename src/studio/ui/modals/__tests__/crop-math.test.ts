import assert from "node:assert/strict";
import {
  clampImageOffset,
  fitScale,
  fractionToWindow,
  fullRect,
  isNoopCrop,
  limitOutputSize,
  minZoomFor,
  moveRect,
  parseCropMeta,
  rectToSource,
  resizeRect,
  rotatedSize,
  windowToFraction,
  zoomAboutWindow,
} from "../crop-math";
import { runSuite } from "../../../../testing/test-harness";

const bounds = { w: 400, h: 300 };

export async function runAll() {
  return runSuite("studio/ui/modals/crop-math", {
    "the frame starts as the whole image"() {
      assert.deepEqual(fullRect(bounds), { x: 0, y: 0, w: 400, h: 300 });
    },

    "moving the frame is clamped inside the image"() {
      const frame = { x: 100, y: 50, w: 200, h: 100 };
      assert.deepEqual(moveRect(frame, 30, -20, bounds), { x: 130, y: 30, w: 200, h: 100 });
      assert.deepEqual(moveRect(frame, 999, 999, bounds), { x: 200, y: 200, w: 200, h: 100 });
      assert.deepEqual(moveRect(frame, -999, -999, bounds), { x: 0, y: 0, w: 200, h: 100 });
    },

    "dragging a corner resizes from the opposite corner and stays in bounds"() {
      const frame = { x: 100, y: 100, w: 200, h: 100 };
      assert.deepEqual(resizeRect(frame, "se", 50, 40, bounds), { x: 100, y: 100, w: 250, h: 140 });
      assert.deepEqual(resizeRect(frame, "nw", -30, -20, bounds), { x: 70, y: 80, w: 230, h: 120 });
      // past the image edge -> clamped
      assert.deepEqual(resizeRect(frame, "se", 9999, 9999, bounds), { x: 100, y: 100, w: 300, h: 200 });
      assert.deepEqual(resizeRect(frame, "nw", -9999, -9999, bounds), { x: 0, y: 0, w: 300, h: 200 });
    },

    "edge handles change one axis only"() {
      const frame = { x: 100, y: 100, w: 200, h: 100 };
      assert.deepEqual(resizeRect(frame, "e", 40, 999, bounds), { x: 100, y: 100, w: 240, h: 100 });
      assert.deepEqual(resizeRect(frame, "s", 999, 40, bounds), { x: 100, y: 100, w: 200, h: 140 });
      assert.deepEqual(resizeRect(frame, "w", -40, 0, bounds), { x: 60, y: 100, w: 240, h: 100 });
      assert.deepEqual(resizeRect(frame, "n", 0, -40, bounds), { x: 100, y: 60, w: 200, h: 140 });
    },

    "the frame can't collapse below the minimum size"() {
      const frame = { x: 100, y: 100, w: 200, h: 100 };
      const squeezed = resizeRect(frame, "e", -9999, 0, bounds, 24);
      assert.equal(squeezed.w, 24);
      assert.equal(squeezed.x, 100);
      const flipped = resizeRect(frame, "nw", 9999, 9999, bounds, 24);
      assert.equal(flipped.w, 24);
      assert.equal(flipped.h, 24);
      assert.equal(flipped.x + flipped.w, 300);
      assert.equal(flipped.y + flipped.h, 200);
    },

    "rotated bounding box and fit scale"() {
      assert.deepEqual(rotatedSize({ w: 100, h: 50 }, 0), { w: 100, h: 50 });
      const quarter = rotatedSize({ w: 100, h: 50 }, 90);
      assert.ok(Math.abs(quarter.w - 50) < 1e-9 && Math.abs(quarter.h - 100) < 1e-9);
      const diag = rotatedSize({ w: 100, h: 100 }, 45);
      assert.ok(Math.abs(diag.w - 141.42135) < 1e-3);
      assert.equal(fitScale({ w: 1000, h: 500 }, { w: 500, h: 500 }), 0.5);
      assert.equal(fitScale({ w: 100, h: 100 }, { w: 500, h: 500 }), 1);
      assert.equal(fitScale({ w: 100, h: 100 }, { w: 500, h: 500 }, true), 5);
      assert.equal(fitScale({ w: 0, h: 10 }, { w: 5, h: 5 }), 1);
    },

    "the on-screen frame maps back to whole source pixels"() {
      const source = { w: 2000, h: 1000 };
      assert.deepEqual(rectToSource({ x: 50, y: 25, w: 100, h: 50 }, 0.5, source), { x: 100, y: 50, w: 200, h: 100 });
      // rounding and clamping never escape the image
      const edge = rectToSource({ x: 999.6, y: 499.9, w: 999, h: 999 }, 0.5, source);
      assert.ok(edge.x + edge.w <= 2000 && edge.y + edge.h <= 1000 && edge.w >= 1 && edge.h >= 1);
    },

    "no-op detection and output size cap"() {
      assert.equal(isNoopCrop({ x: 0, y: 0, w: 800, h: 600 }, { w: 800, h: 600 }, 0), true);
      assert.equal(isNoopCrop({ x: 0, y: 0, w: 800, h: 600 }, { w: 800, h: 600 }, 5), false);
      assert.equal(isNoopCrop({ x: 1, y: 0, w: 799, h: 600 }, { w: 800, h: 600 }, 0), false);
      assert.deepEqual(limitOutputSize({ w: 1000, h: 500 }, 4096), { size: { w: 1000, h: 500 }, factor: 1 });
      const big = limitOutputSize({ w: 8000, h: 4000 }, 4000);
      assert.deepEqual(big.size, { w: 4000, h: 2000 });
      assert.equal(big.factor, 0.5);
    },

    "Canva-style: the image slides under a fixed window but always covers it"() {
      const image = { w: 400, h: 300 };
      const window = { x: 100, y: 80, w: 200, h: 150 };
      // image top-left at (50, 40): moving freely inside the allowed range
      assert.deepEqual(clampImageOffset({ x: 60, y: 50 }, image, window), { x: 60, y: 50 });
      // dragging too far right/down would expose the window's left/top -> held at the window edge
      assert.deepEqual(clampImageOffset({ x: 999, y: 999 }, image, window), { x: 100, y: 80 });
      // dragging too far left/up would expose the right/bottom
      assert.deepEqual(clampImageOffset({ x: -999, y: -999 }, image, window), { x: -100, y: -70 });
    },

    "zoom keeps the point under the window centre in place and still covers the window"() {
      const image = { w: 400, h: 300 };
      const window = { x: 100, y: 75, w: 200, h: 150 };
      const offset = { x: 0, y: 0 };
      const next = { w: 800, h: 600 };
      const moved = zoomAboutWindow(offset, image, window, next);
      // window centre (200,150) was over image fraction (0.5,0.5) -> still the image centre
      assert.equal(moved.x + next.w / 2, 200);
      assert.equal(moved.y + next.h / 2, 150);
      const covered = clampImageOffset(moved, next, window);
      assert.deepEqual(covered, moved);
      assert.equal(minZoomFor(window, image), 1);
      assert.equal(minZoomFor({ x: 0, y: 0, w: 600, h: 150 }, image), 1.5);
    },

    "window <-> fraction round trip survives moving and zooming the image"() {
      const image = { w: 800, h: 600 };
      const offset = { x: -100, y: -50 };
      const window = { x: 100, y: 50, w: 400, h: 300 };
      const fraction = windowToFraction(window, offset, image);
      assert.deepEqual(fraction, { x: 0.25, y: 1 / 6, w: 0.5, h: 0.5 });
      // reopen later at a different on-screen position/size
      const restored = fractionToWindow(fraction, { x: 10, y: 20 }, { w: 400, h: 300 });
      assert.deepEqual(restored, { x: 110, y: 70, w: 200, h: 150 });
    },

    "crop metadata from outside is validated"() {
      const ok = parseCropMeta({ rotation: 12.3456, window: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } });
      assert.deepEqual(ok, { rotation: 12.35, window: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } });
      assert.equal(parseCropMeta(null), null);
      assert.equal(parseCropMeta({ rotation: 400, window: { x: 0, y: 0, w: 1, h: 1 } }), null);
      assert.equal(parseCropMeta({ rotation: 0, window: { x: 0.6, y: 0, w: 0.6, h: 1 } }), null);
      assert.equal(parseCropMeta({ rotation: 0, window: { x: 0, y: 0, w: 0, h: 1 } }), null);
      assert.equal(parseCropMeta({ rotation: "0", window: { x: 0, y: 0, w: 1, h: 1 } }), null);
      assert.equal(parseCropMeta({ rotation: 0, window: { x: NaN, y: 0, w: 1, h: 1 } }), null);
    },
  });
}
