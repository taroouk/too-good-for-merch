// file: src/studio/render/__tests__/restore-template-alpha.test.ts
//
// Regression: AI mockups on the Oversized photos came back with a black
// background and hard, jagged edges. Gemini returns an opaque JPEG of the
// subject crop; pasting it back over the transparent-background template
// made every transparent pixel inside the crop opaque black. Reproduced
// here with an opaque black block standing in for Gemini's crop.
import assert from "node:assert/strict";
import sharp from "sharp";
import { restoreTemplateAlpha } from "../composite";
import { loadTemplateBuffer } from "../templates";
import { runSuite } from "./test-harness";

async function alphaStats(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return { alpha, width: info.width, height: info.height };
}

export async function runAll() {
  return runSuite("render/restore-template-alpha", {
    async "a spliced opaque crop gets the template's own transparency back (Oversized)"() {
      for (const side of ["front", "back"] as const) {
        const template = await loadTemplateBuffer("OVERSIZED", "WHITE", side);
        const meta = await sharp(template).metadata();
        const w = meta.width!, h = meta.height!;
        // Opaque black over the whole middle region, like Gemini's JPEG crop.
        const block = await sharp({ create: { width: Math.round(w * 0.8), height: Math.round(h * 0.8), channels: 3, background: "#000" } })
          .png()
          .toBuffer();
        const spliced = await sharp(template).composite([{ input: block, left: Math.round(w * 0.1), top: Math.round(h * 0.1) }]).png().toBuffer();

        const before = await alphaStats(spliced);
        const restored = await alphaStats(await restoreTemplateAlpha(spliced, template));
        const original = await alphaStats(template);

        let opaqueWhereTransparent = 0;
        for (let i = 0; i < original.alpha.length; i++) if (original.alpha[i] === 0 && before.alpha[i] === 255) opaqueWhereTransparent++;
        assert.ok(opaqueWhereTransparent > 1000, `${side}: the splice should have covered transparent background (bug reproduced)`);

        assert.equal(restored.width, original.width);
        assert.equal(restored.height, original.height);
        let mismatched = 0;
        for (let i = 0; i < original.alpha.length; i++) if (restored.alpha[i] !== original.alpha[i]) mismatched++;
        assert.equal(mismatched, 0, `${side}: ${mismatched} pixels' alpha differ from the template`);
      }
    },

    async "an image without template transparency is returned untouched"() {
      const opaque = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
      const img = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#123456" } }).png().toBuffer();
      assert.equal(Buffer.compare(await restoreTemplateAlpha(img, opaque), img), 0);
    },
  });
}
