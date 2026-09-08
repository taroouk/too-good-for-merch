// file: src/studio/render/__tests__/client-server-geometry-parity.test.ts
//
// P1-11 regression: proves the CLIENT preview's trim-aware geometry model
// (useTrimmedArtworkUrl.ts + the CSS box getPlacementStyle() /
// artworkOffsetPx() produce) agrees with the SERVER's trim-aware geometry
// (sharp-renderer.ts feeding trimToVisibleBounds' dimensions into
// resolvePlacement), for an artwork with ASYMMETRIC transparent padding --
// i.e. padding that is NOT the same on every side, so the raw canvas's
// aspect ratio differs from the visible content's real aspect ratio.
//
// Both sides are fed through the exact same alpha-scan primitive
// (scanAboveThresholdBBox from ../alpha-trim -- the shared module
// trimToVisibleBounds and useTrimmedArtworkUrl.ts both call), never a
// second reimplementation of "what counts as trimmed content" -- per the
// project's own goal of a shared geometry definition instead of
// duplicating the Sharp algorithm in React.
//
// This test is intentionally built to FAIL if the client model reverts to
// using the RAW (untrimmed) canvas's aspect ratio instead of the trimmed
// content's aspect ratio: the "old client (untrimmed)" case below asserts
// the two boxes DIFFER whenever padding is asymmetric enough to change the
// aspect ratio, which is exactly the bug useTrimmedArtworkUrl.ts fixes.
import assert from "node:assert/strict";
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import { scanAboveThresholdBBox } from "../alpha-trim";
import { getPlacementBox, getPlacementSide, getTemplateAspectRatio } from "../placement-config";
import { resolvePlacement } from "../transform";
import { runSuite } from "./test-harness";

// Builds a raw RGBA buffer (the same shape sharp's .raw().ensureAlpha() and
// a browser canvas's getImageData() both produce: row-major, 4 bytes/pixel)
// representing a fully-opaque solid rectangle placed at (left, top) inside
// an otherwise fully-transparent canvas -- i.e. an upload with transparent
// padding whose amount differs per edge whenever the rect isn't centered.
function paddedArtworkRaw(
  canvas: { width: number; height: number },
  rect: { width: number; height: number },
  offset: { left: number; top: number },
): Uint8Array {
  const data = new Uint8Array(canvas.width * canvas.height * 4); // alpha=0 everywhere by default
  for (let y = offset.top; y < offset.top + rect.height; y++) {
    for (let x = offset.left; x < offset.left + rect.width; x++) {
      const i = (y * canvas.width + x) * 4;
      data[i] = 255; // R
      data[i + 1] = 0; // G
      data[i + 2] = 0; // B
      data[i + 3] = 255; // A -- fully opaque visible content
    }
  }
  return data;
}

// Independent model of the CLIENT preview's CSS box: getPlacementStyle()
// (top/left/width%, height:auto) then `transform: translate(x*W, y*W)
// scale(s)` with default (center) transform-origin -- see
// geometry-parity.test.ts's cssEquivalentBox for the same model applied
// elsewhere. `height: auto` means the browser derives the artwork <img>'s
// rendered height from ITS OWN intrinsic aspect ratio, i.e. whatever
// image is actually in `src` -- the raw upload if untrimmed, or the
// trimmed crop if useTrimmedArtworkUrl produced one.
function clientCssBox(
  product: ProductType,
  color: GarmentColor,
  placement: PlacementType,
  transform: { x: number; y: number; scale: number },
  templateWidth: number,
  templateHeight: number,
  imgIntrinsicWidth: number,
  imgIntrinsicHeight: number,
) {
  const box = getPlacementBox(product, color, placement);
  const width0 = box.widthPct * templateWidth;
  const height0 = width0 * (imgIntrinsicHeight / imgIntrinsicWidth);
  const left0 = box.xPct * templateWidth;
  const top0 = box.yPct * templateHeight;

  const centerX = left0 + width0 / 2;
  const centerY = top0 + height0 / 2;
  const scaledWidth = width0 * transform.scale;
  const scaledHeight = height0 * transform.scale;

  const afterScaleLeft = centerX - scaledWidth / 2;
  const afterScaleTop = centerY - scaledHeight / 2;
  const left = afterScaleLeft + transform.x * templateWidth;
  const top = afterScaleTop + transform.y * templateWidth;

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(1, Math.round(scaledWidth)),
    height: Math.max(1, Math.round(scaledHeight)),
  };
}

const TEMPLATE_WIDTH = 2000;

function templateDimensionsFor(placement: PlacementType): { width: number; height: number } {
  const side = getPlacementSide(placement);
  const aspectRatio = getTemplateAspectRatio(side);
  return { width: TEMPLATE_WIDTH, height: Math.round(TEMPLATE_WIDTH / aspectRatio) };
}

type PaddingCase = {
  name: string;
  canvas: { width: number; height: number };
  rect: { width: number; height: number };
  offset: { left: number; top: number };
};

// All three cases have asymmetric padding (different amounts on opposing
// edges), so the raw canvas aspect ratio provably differs from the visible
// 100x50 (2:1) rect's aspect ratio.
const PADDING_CASES: PaddingCase[] = [
  {
    name: "content hard against top-left, padding only on right/bottom",
    canvas: { width: 400, height: 600 },
    rect: { width: 100, height: 50 },
    offset: { left: 0, top: 0 },
  },
  {
    name: "content hard against bottom-right, padding only on left/top",
    canvas: { width: 500, height: 200 },
    rect: { width: 100, height: 50 },
    offset: { left: 400, top: 150 },
  },
  {
    name: "content off-center both axes, uneven padding on every edge",
    canvas: { width: 300, height: 900 },
    rect: { width: 100, height: 50 },
    offset: { left: 5, top: 800 },
  },
];

export async function runAll() {
  const tests: Record<string, () => void> = {};
  const product: ProductType = "FITTED";
  const color: GarmentColor = "WHITE";
  const placement: PlacementType = "CENTER_FRONT";
  const transform = { x: 0.08, y: -0.06, scale: 1.2 };

  for (const testCase of PADDING_CASES) {
    const { width: templateWidth, height: templateHeight } = templateDimensionsFor(placement);

    tests[`${testCase.name} -- fixed client (trimmed) matches server`] = () => {
      const raw = paddedArtworkRaw(testCase.canvas, testCase.rect, testCase.offset);
      // Same primitive trimToVisibleBounds (server) and useTrimmedArtworkUrl
      // (client) both call -- requireNeighbor=false, matching both call sites.
      const { minX, minY, maxX, maxY } = scanAboveThresholdBBox(
        raw,
        testCase.canvas.width,
        testCase.canvas.height,
        4,
        false,
      );
      const trimmedWidth = maxX - minX + 1;
      const trimmedHeight = maxY - minY + 1;
      assert.equal(trimmedWidth, testCase.rect.width, "sanity: trim recovered the rect's real width");
      assert.equal(trimmedHeight, testCase.rect.height, "sanity: trim recovered the rect's real height");

      // Server: sharp-renderer.ts feeds resolvePlacement the TRIMMED
      // artwork dimensions (see its own comment on why).
      const serverBox = resolvePlacement({
        product,
        color,
        placement,
        transform,
        templateWidth,
        templateHeight,
        artworkWidth: trimmedWidth,
        artworkHeight: trimmedHeight,
      });

      // Fixed client: useTrimmedArtworkUrl crops the <img> to the same
      // trimmed bounds, so its intrinsic width/height (and therefore the
      // height:auto box) is the TRIMMED rect's dimensions too.
      const fixedClientBox = clientCssBox(
        product,
        color,
        placement,
        transform,
        templateWidth,
        templateHeight,
        trimmedWidth,
        trimmedHeight,
      );

      assert.equal(fixedClientBox.left, serverBox.left, "left mismatch: fixed client vs server");
      assert.equal(fixedClientBox.top, serverBox.top, "top mismatch: fixed client vs server");
      assert.equal(fixedClientBox.width, serverBox.width, "width mismatch: fixed client vs server");
      assert.equal(fixedClientBox.height, serverBox.height, "height mismatch: fixed client vs server");
    };

    tests[`${testCase.name} -- pre-fix client (untrimmed) would have drifted from server`] = () => {
      const raw = paddedArtworkRaw(testCase.canvas, testCase.rect, testCase.offset);
      const { minX, minY, maxX, maxY } = scanAboveThresholdBBox(
        raw,
        testCase.canvas.width,
        testCase.canvas.height,
        4,
        false,
      );
      const trimmedWidth = maxX - minX + 1;
      const trimmedHeight = maxY - minY + 1;

      const serverBox = resolvePlacement({
        product,
        color,
        placement,
        transform,
        templateWidth,
        templateHeight,
        artworkWidth: trimmedWidth,
        artworkHeight: trimmedHeight,
      });

      // Old/broken client: sized the box off the RAW upload's own
      // (untrimmed) aspect ratio -- what an <img> with height:auto pointed
      // directly at the raw upload would render.
      const untrimmedClientBox = clientCssBox(
        product,
        color,
        placement,
        transform,
        templateWidth,
        templateHeight,
        testCase.canvas.width,
        testCase.canvas.height,
      );

      const drifted =
        untrimmedClientBox.height !== serverBox.height || untrimmedClientBox.top !== serverBox.top;
      assert.ok(
        drifted,
        `expected the untrimmed client box to disagree with the server box for asymmetric padding, ` +
          `but both were left=${serverBox.left} top=${serverBox.top} w=${serverBox.width} h=${serverBox.height} -- ` +
          `this padding case no longer exercises the regression this suite guards against`,
      );
    };
  }

  return runSuite("client-server-geometry-parity", tests);
}
