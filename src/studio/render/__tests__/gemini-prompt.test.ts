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
import { blankGarmentPrompt, printedArtworkPrompt } from "../gemini-prompt";
import { runSuite } from "./test-harness";

const SAMPLE_BOX = { leftPct: 0.34, topPct: 0.4, widthPct: 0.32, heightPct: 0.2, rotationDeg: 0 };

async function runBlankGarmentPromptSuite() {
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

// printedArtworkPrompt() -- the "let Gemini actually print the artwork"
// prompt, used instead of blankGarmentPrompt() by the AI Mockup route since
// the user explicitly chose realism (fabric-following print) over the old
// flat-Sharp-overlay approach's pixel-exact placement guarantee.
async function runPrintedArtworkPromptSuite() {
  return runSuite("gemini-prompt-printed-artwork", {
    "includes the garment type, color, and view"() {
      const prompt = printedArtworkPrompt({ product: "OVERSIZED", color: "BLACK", placement: "FULL_FRONT", box: SAMPLE_BOX });
      assert.match(prompt, /Oversized/);
      assert.match(prompt, /Black/);
      assert.match(prompt, /front view/);
    },

    "derives back view from a BACK placement"() {
      const prompt = printedArtworkPrompt({ product: "FITTED", color: "WHITE", placement: "CENTER_BACK", box: SAMPLE_BOX });
      assert.match(prompt, /back view/);
    },

    "falls back to defaults for null product/color"() {
      const prompt = printedArtworkPrompt({ product: null, color: null, placement: "FULL_FRONT", box: SAMPLE_BOX });
      assert.match(prompt, /T-shirt/);
      assert.match(prompt, /White/);
    },

    "describes the placement box as percentages, derived from the given box"() {
      const prompt = printedArtworkPrompt({
        product: "FITTED",
        color: "WHITE",
        placement: "FULL_FRONT",
        box: { leftPct: 0.2, topPct: 0.36, widthPct: 0.6, heightPct: 0.38, rotationDeg: 0 },
      });
      assert.match(prompt, /20\.0%/);
      assert.match(prompt, /36\.0%/);
      assert.match(prompt, /60\.0%/);
      assert.match(prompt, /38\.0%/);
    },

    "describes non-zero rotation direction and magnitude"() {
      const clockwise = printedArtworkPrompt({ product: "FITTED", color: "WHITE", placement: "FULL_FRONT", box: { ...SAMPLE_BOX, rotationDeg: 15 } });
      assert.match(clockwise, /15\.0 degrees clockwise/);
      const counterClockwise = printedArtworkPrompt({ product: "FITTED", color: "WHITE", placement: "FULL_FRONT", box: { ...SAMPLE_BOX, rotationDeg: -10 } });
      assert.match(counterClockwise, /10\.0 degrees counter-clockwise/);
      const upright = printedArtworkPrompt({ product: "FITTED", color: "WHITE", placement: "FULL_FRONT", box: { ...SAMPLE_BOX, rotationDeg: 0 } });
      assert.match(upright, /upright, with no rotation/);
    },

    "always includes the composition-lock instructions (on-model vs flat-lay, framing, crop, camera angle)"() {
      const prompt = printedArtworkPrompt({ product: "OVERSIZED", color: "BLACK", placement: "CENTER_BACK", box: SAMPLE_BOX });
      assert.match(prompt, /COMPOSITION LOCK/);
      assert.match(prompt, /flat-lay/i);
      assert.match(prompt, /ghost-mannequin/i);
      assert.match(prompt, /camera framing and crop exactly/i);
      assert.match(prompt, /aspect ratio/i);
    },

    // REGRESSION: a real generation came back with the person grotesquely
    // stretched vertically -- Gemini reframed/resized its OWN output canvas
    // (likely influenced by INPUT 2's different aspect ratio) instead of
    // matching INPUT 1's, and the splice-back step's fit:"fill" resize then
    // force-stretched that mismatched image onto the template's exact
    // pixel box. This locks in the explicit "never resize the canvas for
    // INPUT 2" instruction added to fix it; route.ts also independently
    // guards this with a real aspect-ratio check on Gemini's response
    // before ever attempting that resize.
    "explicitly forbids the artwork (INPUT 2) from influencing the output canvas's own aspect ratio/dimensions"() {
      const prompt = printedArtworkPrompt({ product: "FITTED", color: "WHITE", placement: "FULL_FRONT", box: SAMPLE_BOX });
      assert.match(prompt, /output image's width-to-height ratio.*MUST be IDENTICAL to INPUT 1/i);
      assert.match(prompt, /must never influence the output canvas's shape/i);
    },

    "instructs Gemini to reproduce the artwork's content/colors exactly, not restyle it"() {
      const prompt = printedArtworkPrompt({ product: "FITTED", color: "WHITE", placement: "FULL_FRONT", box: SAMPLE_BOX });
      assert.match(prompt, /do not redraw, restyle, recolor/i);
      assert.match(prompt, /EXACTLY as given/);
    },

    "instructs Gemini to make the print follow fabric folds\\/lighting, not sit flat on top"() {
      const prompt = printedArtworkPrompt({ product: "FITTED", color: "WHITE", placement: "FULL_FRONT", box: SAMPLE_BOX });
      assert.match(prompt, /follow the same folds\/wrinkles\/curvature/i);
      assert.match(prompt, /not a flat sticker/i);
    },

    "is a pure function: identical input produces byte-identical output"() {
      const args = { product: "OVERSIZED", color: "WHITE", placement: "RIGHT_SLEEVE", box: SAMPLE_BOX } as const;
      assert.equal(printedArtworkPrompt(args), printedArtworkPrompt(args));
    },
  });
}

export async function runAll() {
  const blank = await runBlankGarmentPromptSuite();
  const printed = await runPrintedArtworkPromptSuite();
  return {
    passed: blank.passed + printed.passed,
    failed: blank.failed + printed.failed,
  };
}
