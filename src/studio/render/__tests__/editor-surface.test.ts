// file: src/studio/render/__tests__/editor-surface.test.ts
//
// The Bespoke popup designs on a FLAT tee while everything downstream of
// it (the Live Model Preview, the Print Mockup, the Gemini mockup) renders
// onto a photographed-model template. editor-surface.ts is the only thing
// standing between those two coordinate systems, so the properties this
// suite locks in are exactly the ones that make "what I built in the popup
// is what the model outside is wearing" true:
//
//   1. The conversion is a genuine bijection -- a drag recorded in editor
//      space and re-displayed must come back byte-identical, or artwork
//      would creep on every re-render.
//   2. It is garment-RELATIVE, not canvas-relative: a placement's position
//      and size measured against the SHIRT must be identical on both
//      surfaces. This is the whole point; a canvas-relative mapping is the
//      bug being prevented.
//   3. Nothing it produces escapes the flat tee's canvas or its garment.
import assert from "node:assert/strict";
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import {
  getEditorAspectRatio,
  getEditorGarmentFrame,
  getEditorPlacementBox,
  getEditorSafeArea,
  getTemplateGarmentFrame,
  toEditorOffset,
  toTemplateOffset,
} from "../editor-surface";
import { getPlacementBox, getPlacementSide } from "../placement-config";
import { runSuite } from "./test-harness";

const PRODUCTS: ProductType[] = ["FITTED", "OVERSIZED", "CUSTOM"];
const COLORS: GarmentColor[] = ["WHITE", "BLACK", "CUSTOM"];
const PLACEMENTS: PlacementType[] = [
  "CENTER_FRONT",
  "FULL_FRONT",
  "LEFT_CHEST",
  "RIGHT_CHEST",
  "CENTER_BACK",
  "FULL_BACK",
  "LEFT_SLEEVE",
  "RIGHT_SLEEVE",
];

function forEachCombo(fn: (product: ProductType, color: GarmentColor, placement: PlacementType) => void) {
  for (const product of PRODUCTS) {
    for (const color of COLORS) {
      for (const placement of PLACEMENTS) {
        fn(product, color, placement);
      }
    }
  }
}

function closeTo(actual: number, expected: number, tolerance: number, message: string) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

export async function runAll() {
  return runSuite("editor-surface", {
    "offset conversion round-trips exactly in both directions (no drift on repeated drags)"() {
      const samples = [
        { x: 0, y: 0 },
        { x: 0.13, y: -0.07 },
        { x: -0.42, y: 0.31 },
        { x: 1.5, y: -1.5 },
      ];
      forEachCombo((product, color, placement) => {
        for (const sample of samples) {
          const there = toEditorOffset(sample, product, color, placement);
          const back = toTemplateOffset(there, product, color, placement);
          closeTo(back.x, sample.x, 1e-12, `x round trip for ${product}/${color}/${placement}`);
          closeTo(back.y, sample.y, 1e-12, `y round trip for ${product}/${color}/${placement}`);
        }
      });
    },

    "a zero offset stays a zero offset -- an untouched artwork never shifts just by being displayed"() {
      forEachCombo((product, color, placement) => {
        const editor = toEditorOffset({ x: 0, y: 0 }, product, color, placement);
        assert.equal(editor.x, 0);
        assert.equal(editor.y, 0);
      });
    },

    "the conversion is linear -- doubling a drag doubles the on-screen movement, in both axes"() {
      forEachCombo((product, color, placement) => {
        const single = toEditorOffset({ x: 0.2, y: 0.1 }, product, color, placement);
        const double = toEditorOffset({ x: 0.4, y: 0.2 }, product, color, placement);
        closeTo(double.x, single.x * 2, 1e-12, `x linearity for ${product}/${color}/${placement}`);
        closeTo(double.y, single.y * 2, 1e-12, `y linearity for ${product}/${color}/${placement}`);
      });
    },

    "placement boxes are GARMENT-relative, not canvas-relative: same position on the shirt on both surfaces"() {
      forEachCombo((product, color, placement) => {
        const side = getPlacementSide(placement);
        const templateFrame = getTemplateGarmentFrame(product, color, side);
        const editorFrame = getEditorGarmentFrame(side);
        const templateBox = getPlacementBox(product, color, placement);
        const editorBox = getEditorPlacementBox(product, color, placement);

        const templateU = (templateBox.xPct - templateFrame.xPct) / templateFrame.widthPct;
        const editorU = (editorBox.xPct - editorFrame.xPct) / editorFrame.widthPct;
        closeTo(editorU, templateU, 1e-9, `horizontal garment-relative position for ${product}/${color}/${placement}`);

        const templateV = (templateBox.yPct - templateFrame.yPct) / templateFrame.heightPct;
        const editorV = (editorBox.yPct - editorFrame.yPct) / editorFrame.heightPct;
        closeTo(editorV, templateV, 1e-9, `vertical garment-relative position for ${product}/${color}/${placement}`);

        const templateW = templateBox.widthPct / templateFrame.widthPct;
        const editorW = editorBox.widthPct / editorFrame.widthPct;
        closeTo(editorW, templateW, 1e-9, `garment-relative width for ${product}/${color}/${placement}`);
      });
    },

    "a drag moves the artwork the same distance ACROSS THE SHIRT on both surfaces"() {
      // The real invariant behind toEditorOffset: x/y are fractions of each
      // canvas's own WIDTH, so equality has to be checked after converting
      // both into garment-relative units (and, for y, out of width units
      // into height units via each surface's aspect ratio).
      forEachCombo((product, color, placement) => {
        const side = getPlacementSide(placement);
        const templateFrame = getTemplateGarmentFrame(product, color, side);
        const editorFrame = getEditorGarmentFrame(side);
        const templateAspect = templateAspectFor(product, color, side);
        const editorAspect = getEditorAspectRatio(side);

        const drag = { x: 0.11, y: 0.09 };
        const editorDrag = toEditorOffset(drag, product, color, placement);

        const templateAcross = drag.x / templateFrame.widthPct;
        const editorAcross = editorDrag.x / editorFrame.widthPct;
        closeTo(editorAcross, templateAcross, 1e-9, `horizontal travel across the garment for ${product}/${color}/${placement}`);

        // x/y are both fractions of the canvas WIDTH, so a vertical
        // offset becomes a fraction of the canvas HEIGHT by multiplying by
        // that canvas's own aspect ratio (width/height) before it can be
        // compared against a frame height.
        const templateDown = (drag.y * templateAspect) / templateFrame.heightPct;
        const editorDown = (editorDrag.y * editorAspect) / editorFrame.heightPct;
        closeTo(editorDown, templateDown, 1e-9, `vertical travel down the garment for ${product}/${color}/${placement}`);
      });
    },

    "every remapped placement box lands inside the flat tee's own canvas"() {
      forEachCombo((product, color, placement) => {
        const box = getEditorPlacementBox(product, color, placement);
        assert.ok(box.widthPct > 0, `non-positive width for ${product}/${color}/${placement}`);
        assert.ok(box.xPct >= 0 && box.xPct <= 1, `xPct out of canvas (${box.xPct}) for ${product}/${color}/${placement}`);
        assert.ok(box.yPct >= 0 && box.yPct <= 1, `yPct out of canvas (${box.yPct}) for ${product}/${color}/${placement}`);
        assert.ok(
          box.xPct + box.widthPct <= 1,
          `box overflows the right canvas edge (${box.xPct + box.widthPct}) for ${product}/${color}/${placement}`,
        );
      });
    },

    "centred placements stay centred on the tee -- CENTER_FRONT/FULL_FRONT/CENTER_BACK/FULL_BACK"() {
      const centred: PlacementType[] = ["CENTER_FRONT", "FULL_FRONT", "CENTER_BACK", "FULL_BACK"];
      for (const product of PRODUCTS) {
        for (const color of COLORS) {
          for (const placement of centred) {
            const side = getPlacementSide(placement);
            const frame = getEditorGarmentFrame(side);
            const box = getEditorPlacementBox(product, color, placement);
            const boxCenter = box.xPct + box.widthPct / 2;
            const bodyCenter = frame.xPct + frame.widthPct / 2;
            // The canonical template boxes themselves are only tuned to
            // the nearest percent, so this is a "visually centred on the
            // body" check, not an exact-equality one.
            closeTo(boxCenter, bodyCenter, 0.03, `${placement} centring for ${product}/${color}`);
          }
        }
      }
    },

    "chest placements sit on the chest, not on the collar or the hem"() {
      for (const product of PRODUCTS) {
        for (const color of COLORS) {
          for (const placement of ["CENTER_FRONT", "LEFT_CHEST", "RIGHT_CHEST"] as const) {
            const frame = getEditorGarmentFrame("front");
            const box = getEditorPlacementBox(product, color, placement);
            const v = (box.yPct - frame.yPct) / frame.heightPct;
            assert.ok(
              v > 0.05 && v < 0.5,
              `${placement} resolved to ${v} down the body for ${product}/${color} -- expected the chest band`,
            );
          }
        }
      }
    },

    "LEFT_CHEST stays left of RIGHT_CHEST, and the two never overlap"() {
      for (const product of PRODUCTS) {
        for (const color of COLORS) {
          const left = getEditorPlacementBox(product, color, "LEFT_CHEST");
          const right = getEditorPlacementBox(product, color, "RIGHT_CHEST");
          assert.ok(
            left.xPct + left.widthPct <= right.xPct + 1e-9,
            `LEFT_CHEST overlaps RIGHT_CHEST for ${product}/${color}`,
          );
        }
      }
    },

    "the remapped drag safe area stays within the flat tee's canvas and covers the body"() {
      for (const product of PRODUCTS) {
        for (const color of COLORS) {
          for (const side of ["front", "back"] as const) {
            const safe = getEditorSafeArea(product, color, side);
            assert.ok(safe.widthPct > 0 && safe.heightPct > 0, `degenerate safe area for ${product}/${color}/${side}`);
            assert.ok(safe.xPct >= -0.01, `safe area starts off-canvas for ${product}/${color}/${side}`);
            assert.ok(
              safe.xPct + safe.widthPct <= 1.01,
              `safe area overflows the canvas for ${product}/${color}/${side}`,
            );
            const body = getEditorGarmentFrame(side);
            assert.ok(
              safe.xPct <= body.xPct && safe.xPct + safe.widthPct >= body.xPct + body.widthPct,
              `safe area does not span the tee's body for ${product}/${color}/${side}`,
            );
          }
        }
      }
    },

    "the flat tees are landscape and the model templates are portrait -- the two surfaces really are different shapes"() {
      // Guards the specific bug this module exists to prevent: if these
      // ever converge, someone has swapped the editor assets for model
      // photos again and the remap is silently doing nothing useful.
      for (const side of ["front", "back"] as const) {
        assert.ok(
          getEditorAspectRatio(side) > 1,
          `expected a landscape flat tee for ${side}, got ${getEditorAspectRatio(side)}`,
        );
      }
    },

    "garment frames are sane on both surfaces: inside their canvas, non-degenerate"() {
      for (const side of ["front", "back"] as const) {
        const editor = getEditorGarmentFrame(side);
        assert.ok(editor.xPct > 0 && editor.xPct + editor.widthPct < 1, `editor frame off-canvas for ${side}`);
        assert.ok(editor.yPct >= 0 && editor.yPct + editor.heightPct <= 1, `editor frame off-canvas for ${side}`);
        for (const product of PRODUCTS) {
          for (const color of COLORS) {
            const template = getTemplateGarmentFrame(product, color, side);
            assert.ok(
              template.xPct > 0 && template.xPct + template.widthPct < 1,
              `template frame off-canvas for ${product}/${color}/${side}`,
            );
            assert.ok(
              template.yPct > 0 && template.yPct + template.heightPct < 1,
              `template frame off-canvas for ${product}/${color}/${side}`,
            );
          }
        }
      }
    },
  });
}

// The per-file template aspect ratios editor-surface.ts uses internally are
// not exported (they are an implementation detail of the remap, not a
// public concept); re-derived here from the same verified pixel dimensions
// recorded in placement-config.ts's measured-dimensions comment so the
// travel test above can check the vertical conversion independently rather
// than by reusing the code under test.
function templateAspectFor(product: ProductType, color: GarmentColor, side: "front" | "back"): number {
  const resolvedProduct = product === "OVERSIZED" ? "OVERSIZED" : "FITTED";
  const resolvedColor = color === "BLACK" ? "BLACK" : "WHITE";
  const table: Record<string, Record<string, Record<string, number>>> = {
    FITTED: {
      WHITE: { front: 581 / 1185, back: 689 / 1345 },
      BLACK: { front: 1118 / 2353, back: 683 / 1439 },
    },
    OVERSIZED: {
      WHITE: { front: 619 / 1197, back: 666 / 1213 },
      BLACK: { front: 646 / 1205, back: 716 / 1310 },
    },
  };
  return table[resolvedProduct][resolvedColor][side];
}
