// file: src/studio/render/__tests__/templates.test.ts
import assert from "node:assert/strict";
import { loadTemplateBuffer } from "../templates";
import { runSuite } from "./test-harness";

export async function runAll() {
  return runSuite("studio/render/templates", {
    async "repeat requests for the same garment/color/side reuse the cached buffer (P3-21h)"() {
      const first = await loadTemplateBuffer("FITTED", "WHITE", "front");
      const second = await loadTemplateBuffer("FITTED", "WHITE", "front");
      // Reference equality proves the second call was served from the
      // in-memory cache rather than issuing a fresh disk read.
      assert.equal(first, second);
    },

    async "different templates are cached independently and still return correct, distinct bytes"() {
      const front = await loadTemplateBuffer("FITTED", "WHITE", "front");
      const back = await loadTemplateBuffer("FITTED", "WHITE", "back");
      assert.notEqual(front, back);
      assert.ok(front.length > 0);
      assert.ok(back.length > 0);

      // Re-fetching each afterward still yields the same cached reference,
      // not a mix-up between cache entries.
      const frontAgain = await loadTemplateBuffer("FITTED", "WHITE", "front");
      const backAgain = await loadTemplateBuffer("FITTED", "WHITE", "back");
      assert.equal(front, frontAgain);
      assert.equal(back, backAgain);
    },

    async "concurrent first-time requests for the same file collapse into a single read"() {
      const [a, b] = await Promise.all([
        loadTemplateBuffer("OVERSIZED", "BLACK", "front"),
        loadTemplateBuffer("OVERSIZED", "BLACK", "front"),
      ]);
      assert.equal(a, b);
    },
  });
}
