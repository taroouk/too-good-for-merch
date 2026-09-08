// file: src/studio/render/__tests__/geometry-parity.test.ts
//
// Proves the invariant this redesign exists for: Studio preview geometry
// === deterministic Print Mockup geometry, for every (product, placement,
// x, y, scale) combination -- not just at one hand-picked value.
//
// The Studio preview (TryOn3DPreview.tsx / BuilderClient.tsx's bespoke
// canvas) positions the artwork with CSS: top/left/width from
// getPlacementStyle() (placement-css.ts, itself derived from
// getPlacementBox() below), then `transform: translate(x*W, y*W)
// scale(s)` with the browser's default transform-origin (50% 50%, i.e.
// the box's own center) -- see BuilderClient.tsx's bespokeArtworkTransform
// and TryOn3DPreview.tsx's artworkTransformStyle. Both containers are now
// set to the template's own REAL aspect ratio per side (getTemplateAspectRatio
// in placement-config.ts -- front templates really are 1:1 squares, but
// back templates are a 1024x1536, 2:3 portrait), so a fraction of the
// container is the same fraction of the template on BOTH sides.
//
// Note the y offset is x*W and y*W -- BOTH axes are a fraction of the
// canvas WIDTH, because that is the unit the client itself writes when a
// drag delta becomes `px / containerWidth` for x and y alike
// (BuilderClient's handleArtworkPointerMove). This suite previously wrote
// y*H here, which was a restatement of what resolvePlacement happened to
// do rather than a model of the client -- so it passed while the server
// really was placing back-template artwork 1.5x too low. When correcting
// that, fix the CLIENT model here first and let it fail; never edit this
// expectation to match whatever resolvePlacement currently returns.
//
// This suite previously used one hardcoded 2000x2000 SQUARE for every
// placement, front and back alike -- meaning it could never have caught a
// divergence specific to the back template's real, non-square shape (the
// exact bug BespokeModal.tsx/TryOn3DPreview.tsx's aspect-ratio fix
// addresses: a forced-square container silently pillarboxing a portrait
// photo). templateDimensionsFor() below derives each placement's template
// height from the SAME getTemplateAspectRatio() the display-layer fix
// consumes, so this test's "template" is proportioned like the real thing
// on both sides, not just front.
//
// cssEquivalentBox() below reimplements exactly that CSS composition
// (independently of transform.ts's scaleBoxAroundCenter) directly from
// getPlacementBox()'s canonical output, and this suite asserts it matches
// resolvePlacement()'s actual pixel output. If a future change moves one
// side off the shared formula (e.g. a new hardcoded coordinate table, or a
// top-left-anchored scale on one side only), this test fails.
import assert from "node:assert/strict";
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import { getPlacementBox, getPlacementSide, getTemplateAspectRatio } from "../placement-config";
import { resolvePlacement } from "../transform";
import { runSuite } from "./test-harness";

const PRODUCTS: ProductType[] = ["FITTED", "OVERSIZED"];
const COLOR: GarmentColor = "WHITE";
const PLACEMENTS: PlacementType[] = [
  "FULL_FRONT",
  "CENTER_FRONT",
  "LEFT_CHEST",
  "RIGHT_CHEST",
  "FULL_BACK",
  "CENTER_BACK",
  "LEFT_SLEEVE",
  "RIGHT_SLEEVE",
];
const SCALES = [0.6, 1, 1.4];
const OFFSETS = [
  { x: 0, y: 0 },
  { x: 0.08, y: -0.05 },
  { x: -0.12, y: 0.1 },
];

// Base width for the synthetic "template" this suite checks parity
// against -- an arbitrary round number, not a real pixel count. The
// PROPORTIONS that matter (square for front, 2:3 portrait for back) come
// from getTemplateAspectRatio, not from this constant.
const TEMPLATE_WIDTH = 2000;
const ARTWORK_WIDTH = 400;
const ARTWORK_HEIGHT = 240;

function templateDimensionsFor(placement: PlacementType): { width: number; height: number } {
  const side = getPlacementSide(placement);
  const aspectRatio = getTemplateAspectRatio(side); // width / height
  return { width: TEMPLATE_WIDTH, height: Math.round(TEMPLATE_WIDTH / aspectRatio) };
}

// Independent reimplementation of "top/left/width box, then CSS
// `transform: translate(x*W, y*H) scale(s)` with default (center)
// transform-origin" -- the exact rule the browser applies to the Studio
// preview's artwork <img>. Deliberately not calling scaleBoxAroundCenter.
function cssEquivalentBox(
  product: ProductType,
  color: GarmentColor,
  placement: PlacementType,
  transform: { x: number; y: number; scale: number },
  templateWidth: number,
  templateHeight: number,
  artworkWidth: number,
  artworkHeight: number,
) {
  const box = getPlacementBox(product, color, placement);
  const width0 = box.widthPct * templateWidth;
  const height0 = width0 * (artworkHeight / artworkWidth);
  const left0 = box.xPct * templateWidth;
  const top0 = box.yPct * templateHeight;

  const centerX = left0 + width0 / 2;
  const centerY = top0 + height0 / 2;
  const scaledWidth = width0 * transform.scale;
  const scaledHeight = height0 * transform.scale;

  // scale(s) around the box's own center, applied first (innermost)...
  const afterScaleLeft = centerX - scaledWidth / 2;
  const afterScaleTop = centerY - scaledHeight / 2;
  // ...then translate(x*W, y*W), applied second (outermost), in real px
  // unaffected by the scale -- matches CSS matrix composition order for
  // `transform: translate(...) scale(...)`. Both axes use the WIDTH; see
  // the file header for why y*H here was the bug rather than the spec.
  const left = afterScaleLeft + transform.x * templateWidth;
  const top = afterScaleTop + transform.y * templateWidth;

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(1, Math.round(scaledWidth)),
    height: Math.max(1, Math.round(scaledHeight)),
  };
}

export async function runAll() {
  const tests: Record<string, () => void> = {};

  for (const product of PRODUCTS) {
    for (const placement of PLACEMENTS) {
      for (const scale of SCALES) {
        for (const { x, y } of OFFSETS) {
          const name = `${product}/${placement} scale=${scale} x=${x} y=${y} -- CSS box matches resolvePlacement`;
          tests[name] = () => {
            const { width: templateWidth, height: templateHeight } = templateDimensionsFor(placement);
            const expected = cssEquivalentBox(
              product,
              COLOR,
              placement,
              { x, y, scale },
              templateWidth,
              templateHeight,
              ARTWORK_WIDTH,
              ARTWORK_HEIGHT,
            );
            const actual = resolvePlacement({
              product,
              color: COLOR,
              placement,
              transform: { x, y, scale },
              templateWidth,
              templateHeight,
              artworkWidth: ARTWORK_WIDTH,
              artworkHeight: ARTWORK_HEIGHT,
            });

            assert.equal(actual.left, expected.left, `left mismatch for ${name}`);
            assert.equal(actual.top, expected.top, `top mismatch for ${name}`);
            assert.equal(actual.width, expected.width, `width mismatch for ${name}`);
            assert.equal(actual.height, expected.height, `height mismatch for ${name}`);
          };
        }
      }
    }
  }

  return runSuite("geometry-parity", tests);
}
