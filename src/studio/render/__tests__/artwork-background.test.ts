// file: src/studio/render/__tests__/artwork-background.test.ts
//
// Background handling is non-destructive: a transparent PNG stays transparent
// (the garment shows through), an intentional white background is printed as
// the customer made it (never knocked out), and a JPG keeps its background.
import assert from "node:assert/strict";
import sharp from "sharp";
import { SharpMockupRenderer } from "../engines/sharp-renderer";
import { loadTemplateBuffer } from "../templates";
import { resolvePlacement } from "../transform";
import { trimToVisibleBounds } from "../garment-bbox";
import { runSuite } from "./test-harness";

const N = 400;
const lum = (p: number[]) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];

// a black disc on a white background (opaque), or the same disc with a see-through background
function discSvg(bg: string) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">${bg}<circle cx="200" cy="200" r="90" fill="#101010"/></svg>`);
}

async function renderOnBlack(artwork: Buffer) {
  const template = await loadTemplateBuffer("FITTED", "BLACK", "front");
  const t = await sharp(template).metadata();
  const transform = { x: 0, y: 0, scale: 1 };
  const trimmedMeta = await sharp(await trimToVisibleBounds(artwork)).metadata();
  const resolved = resolvePlacement({ product: "FITTED", color: "BLACK", placement: "FULL_FRONT", transform, templateWidth: t.width!, templateHeight: t.height!, artworkWidth: trimmedMeta.width!, artworkHeight: trimmedMeta.height! });
  const out = await new SharpMockupRenderer().render({ artwork, template, product: "FITTED", color: "BLACK", placement: "FULL_FRONT", transform, dpi: 150, outputScale: 1 });
  const k = out.width / t.width!;
  const raw = await sharp(out.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (tx: number, ty: number) => {
    const x = Math.round(tx * k), y = Math.round(ty * k);
    const i = (y * raw.info.width + x) * 4;
    return [raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3]];
  };
  return { resolved, at };
}

export async function runAll() {
  return runSuite("artwork-background", {
    async "a transparent PNG stays transparent: the garment shows through, nothing is painted white"() {
      const art = await sharp(discSvg("")).png().toBuffer(); // see-through background
      const { resolved, at } = await renderOnBlack(art);
      // trimmed to the disc, so the artwork box is the disc; sample just inside a corner of the box
      // (outside the disc, inside the box) -> must still be the black garment
      const corner = at(resolved.left + 3, resolved.top + 3);
      assert.ok(lum(corner) < 60, `corner luminance ${lum(corner).toFixed(0)} -- the see-through area was painted`);
      assert.ok(lum(at(resolved.left + resolved.width / 2, resolved.top + resolved.height / 2)) < 60);
    },

    async "an intentional white background is printed, never removed (PNG)"() {
      const art = await sharp(discSvg(`<rect width="${N}" height="${N}" fill="#ffffff"/>`)).png().toBuffer();
      const { resolved, at } = await renderOnBlack(art);
      const corner = at(resolved.left + 8, resolved.top + 8);
      assert.ok(lum(corner) > 190, `white background was knocked out (luminance ${lum(corner).toFixed(0)})`);
      assert.ok(corner[3] > 250);
    },

    async "a JPG keeps its background"() {
      const jpg = await sharp(discSvg(`<rect width="${N}" height="${N}" fill="#ffffff"/>`)).jpeg({ quality: 92 }).toBuffer();
      const { resolved, at } = await renderOnBlack(jpg);
      assert.ok(lum(at(resolved.left + 8, resolved.top + 8)) > 190, "JPG white background was removed");
    },

    async "opaque artwork is never trimmed or cropped (its white margins are part of the picture)"() {
      const art = await sharp(discSvg(`<rect width="${N}" height="${N}" fill="#ffffff"/>`)).png().toBuffer();
      const trimmed = await sharp(await trimToVisibleBounds(art)).metadata();
      assert.equal(trimmed.width, N);
      assert.equal(trimmed.height, N);
    },

    async "a transparent PNG is trimmed only along its see-through margins (content untouched)"() {
      const art = await sharp(discSvg("")).png().toBuffer();
      const trimmed = await sharp(await trimToVisibleBounds(art)).metadata();
      assert.ok(trimmed.width! < N && trimmed.width! >= 176, `trimmed width ${trimmed.width}`);
    },
  });
}
