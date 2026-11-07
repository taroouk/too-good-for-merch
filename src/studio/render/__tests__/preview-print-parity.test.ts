// file: src/studio/render/__tests__/preview-print-parity.test.ts
//
// What the Studio preview draws (flat-tee overlay: placement box + transform,
// laid out by BespokeModal) and what the server prints (resolvePlacement on the
// real photo) must be the same place on the garment -- for artwork of any shape.
// Compared in garment-frame coordinates, so the flat tee and the photo are
// directly comparable.
//
// All of these must agree, for artwork of any shape (square, tall, wide, icon,
// text), at any scale and drag, for Fitted and Oversized, white and black:
//   - horizontal centre and width,
//   - the anchored top-left corner (undragged, scale 1),
//   - the VERTICAL centre and the HEIGHT (< 2% of the garment frame),
//   - and the flat tee is mapped to the photo with ONE scale on both axes, so
//     the artwork is never stretched in the preview.
import assert from "node:assert/strict";
import sharp from "sharp";
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import { getEditorAspectRatio, getEditorMappingFrame, getEditorPlacementBox, getTemplateGarmentFrame, toEditorOffset } from "../editor-surface";
import { getPlacementSide } from "../placement-config";
import { loadTemplateBuffer } from "../templates";
import { resolvePlacement } from "../transform";
import { runSuite } from "./test-harness";

const VARIANTS: Array<[ProductType, GarmentColor]> = [["FITTED", "WHITE"], ["FITTED", "BLACK"], ["OVERSIZED", "WHITE"], ["OVERSIZED", "BLACK"]];
const PLACEMENTS: PlacementType[] = ["FULL_BACK", "FULL_FRONT", "CENTER_FRONT", "LEFT_CHEST"];
// artwork shapes (height / width): square, tall, very tall, wide, banner
const ASPECTS = [1, 2, 1.4, 0.5, 0.3];

export async function runAll() {
  const tests: Record<string, () => Promise<void>> = {};
  for (const [product, color] of VARIANTS) {
    for (const placement of PLACEMENTS) {
      tests[`${product}/${color}/${placement}: preview rectangle = print rectangle for any artwork shape, scale and drag`] = async () => {
        const side = getPlacementSide(placement);
        const buf = await loadTemplateBuffer(product, color, side);
        const meta = await sharp(buf).metadata();
        const Tw = meta.width!, Th = meta.height!;
        const Ew = 1000, Eh = Ew / getEditorAspectRatio(side);
        const ef = getEditorMappingFrame(product, color, side), tf = getTemplateGarmentFrame(product, color, side);
        for (const aa of ASPECTS) {
          for (const [scale, tx, ty] of [[1, 0, 0], [0.6, 0, 0], [0.8, 0.02, -0.015]] as const) {
            const aw = 400, ah = Math.round(400 * aa);
            let resolved;
            try {
              resolved = resolvePlacement({ product, color, placement, transform: { x: tx, y: ty, scale }, templateWidth: Tw, templateHeight: Th, artworkWidth: aw, artworkHeight: ah });
            } catch {
              continue; // a combination the server itself refuses (covers too much of the garment)
            }
            // print: centre and width in garment-frame coordinates
            const printCx = (resolved.left + resolved.width / 2) / Tw, printCy = (resolved.top + resolved.height / 2) / Th;
            const pu = (printCx - tf.xPct) / tf.widthPct, pv = (printCy - tf.yPct) / tf.heightPct, pw = resolved.width / Tw / tf.widthPct;
            // preview: the overlay exactly as BespokeModal lays it out
            const box = getEditorPlacementBox(product, color, placement);
            const off = toEditorOffset({ x: tx, y: ty }, product, color, placement);
            const w0 = box.widthPct * Ew, h0 = w0 * aa;
            const cx = box.xPct * Ew + w0 / 2 + off.x * Ew, cy = box.yPct * Eh + h0 / 2 + off.y * Ew;
            const vu = (cx / Ew - ef.xPct) / ef.widthPct, vv = (cy / Eh - ef.yPct) / ef.heightPct, vw = (w0 * scale) / Ew / ef.widthPct;
            const tag = `aspect ${aa} scale ${scale} drag ${tx},${ty}`;
            const printH = resolved.height / Th / tf.heightPct;
            const prevH = (h0 * scale) / Eh / ef.heightPct;
            const printTop = (resolved.top / Th - tf.yPct) / tf.heightPct;
            const prevTop = vv - prevH / 2;
            const TOL = 0.02; // 2% of the garment frame
            assert.ok(Math.abs(pu - vu) < TOL, `${tag}: horizontal centre differs (print ${pu.toFixed(4)} vs preview ${vu.toFixed(4)})`);
            assert.ok(Math.abs(pw - vw) < TOL, `${tag}: width differs (print ${pw.toFixed(4)} vs preview ${vw.toFixed(4)})`);
            assert.ok(Math.abs(pv - vv) < TOL, `${tag}: vertical centre differs (print ${pv.toFixed(4)} vs preview ${vv.toFixed(4)})`);
            assert.ok(Math.abs(printH - prevH) < TOL, `${tag}: height differs (print ${printH.toFixed(4)} vs preview ${prevH.toFixed(4)})`);
            assert.ok(Math.abs(printTop - prevTop) < TOL, `${tag}: top edge differs (print ${printTop.toFixed(4)} vs preview ${prevTop.toFixed(4)})`);
            assert.ok(Math.abs(prevH / printH - 1) < TOL, `${tag}: preview height is ${((prevH / printH) * 100).toFixed(1)}% of the print's`);
          }
        }
      };
    }
  }
  for (const [product, color] of VARIANTS) {
    for (const side of ["front", "back"] as const) {
      tests[`${product}/${color}/${side}: the flat tee maps to the photo with one scale on both axes (artwork is never stretched)`] = async () => {
        const placement: PlacementType = side === "front" ? "FULL_FRONT" : "FULL_BACK";
        const buf = await loadTemplateBuffer(product, color, side);
        const meta = await sharp(buf).metadata();
        const Tw = meta.width!, Th = meta.height!;
        const Ew = 1000, Eh = Ew / getEditorAspectRatio(side);
        const ef = getEditorMappingFrame(product, color, side), tf = getTemplateGarmentFrame(product, color, side);
        void placement;
        const sx = (Ew * ef.widthPct) / (Tw * tf.widthPct);
        const sy = (Eh * ef.heightPct) / (Th * tf.heightPct);
        assert.ok(Math.abs(sx / sy - 1) < 0.001, `scale differs between axes: x ${sx.toFixed(5)} vs y ${sy.toFixed(5)}`);
      };
    }
  }
  return runSuite("preview-print-parity", tests);
}
