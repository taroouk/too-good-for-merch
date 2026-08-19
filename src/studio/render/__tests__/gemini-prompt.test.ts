// file: src/studio/render/__tests__/gemini-prompt.test.ts
//
// Covers blankGarmentPrompt() -- specifically that the COMPOSITION LOCK
// instructions (added after repeated-generation testing showed identical
// inputs could come back as an on-model photo in one run and a flat-lay/
// ghost-mannequin shot in another) are present in every prompt this
// function builds, and that garment identity/view are still filled in
// correctly. This can't assert that Gemini actually obeys the prompt --
// that's what scripts/investigate-geometry.mjs's real-generation runs are
// for -- but it locks the instructions in place so a future edit can't
// silently drop them.
import assert from "node:assert/strict";
import { blankGarmentPrompt } from "../gemini-prompt";
import { runSuite } from "./test-harness";

export async function runAll() {
  return runSuite("gemini-prompt", {
    "includes the garment type, color, and view"() {
      const prompt = blankGarmentPrompt({ product: "OVERSIZED", color: "BLACK", placement: "FULL_FRONT" });
      assert.match(prompt, /Oversized/);
      assert.match(prompt, /Black/);
      assert.match(prompt, /front view/);
    },

    "derives back view from a BACK placement"() {
      const prompt = blankGarmentPrompt({ product: "FITTED", color: "WHITE", placement: "CENTER_BACK" });
      assert.match(prompt, /back view/);
    },

    "falls back to defaults for null product/color"() {
      const prompt = blankGarmentPrompt({ product: null, color: null, placement: "FULL_FRONT" });
      assert.match(prompt, /T-shirt/);
      assert.match(prompt, /White/);
    },

    "always includes the composition-lock instructions (on-model vs flat-lay, framing, crop, camera angle)"() {
      for (const [product, color, placement] of [
        ["FITTED", "WHITE", "FULL_FRONT"],
        ["OVERSIZED", "BLACK", "CENTER_BACK"],
        [null, null, "LEFT_CHEST"],
      ] as const) {
        const prompt = blankGarmentPrompt({ product, color, placement });
        assert.match(prompt, /COMPOSITION LOCK/, `missing COMPOSITION LOCK section for ${product}/${color}/${placement}`);
        assert.match(prompt, /flat-lay/i);
        assert.match(prompt, /ghost-mannequin/i);
        assert.match(prompt, /camera framing and crop exactly/i);
        assert.match(prompt, /camera angle exactly/i);
        assert.match(prompt, /aspect ratio/i);
        assert.match(prompt, /photorealism EDIT of the exact input image/i);
      }
    },

    "still includes the pre-existing artwork/text prohibitions"() {
      const prompt = blankGarmentPrompt({ product: "FITTED", color: "WHITE", placement: "FULL_FRONT" });
      assert.match(prompt, /Do NOT add any logo, artwork, graphic, or print/);
      assert.match(prompt, /Do NOT add any text, lettering, or typography/);
    },

    "is a pure function: identical input produces byte-identical output"() {
      const args = { product: "OVERSIZED", color: "WHITE", placement: "RIGHT_SLEEVE" } as const;
      assert.equal(blankGarmentPrompt(args), blankGarmentPrompt(args));
    },
  });
}
