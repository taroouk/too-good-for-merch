// file: src/studio/render/__tests__/golden-snapshot.test.ts
//
// Fixed, synthetic (artwork, template, placement, transform) -> hash,
// compared against a committed baseline. Catches accidental behavior
// drift in the renderer over time. Regenerate the baseline deliberately
// with `UPDATE_GOLDEN=1 npm run test:render` after an intentional
// renderer change.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SharpMockupRenderer } from "../engines/sharp-renderer";
import type { RenderRequest } from "../types";
import { runSuite } from "./test-harness";

const BASELINE_PATH = path.join(process.cwd(), "scripts", "render-golden-snapshot.json");

async function fixedScenarioRequest(): Promise<RenderRequest> {
  const template = await sharp({
    create: { width: 800, height: 800, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
  })
    .png()
    .toBuffer();

  const artwork = await sharp({
    create: { width: 150, height: 90, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 1 } },
  })
    .png()
    .toBuffer();

  return {
    artwork,
    template,
    product: "FITTED",
    color: "WHITE",
    placement: "CENTER_FRONT",
    // x/y are fractions of template width/height (resolution-independent),
    // not raw px -- see ASSUMED_PREVIEW_CONTAINER_PX removal in transform.ts.
    transform: { x: 0.05, y: -0.02, scale: 1.1, rotation: 0 },
    dpi: 150,
  };
}

export async function runAll() {
  const renderer = new SharpMockupRenderer();

  return runSuite("golden-snapshot", {
    async "matches the committed golden hash"() {
      const req = await fixedScenarioRequest();
      const result = await renderer.render(req);
      const hash = createHash("sha256").update(result.data).digest("hex");

      if (process.env.UPDATE_GOLDEN === "1") {
        writeFileSync(BASELINE_PATH, JSON.stringify({ hash }, null, 2) + "\n");
        return;
      }

      if (!existsSync(BASELINE_PATH)) {
        throw new Error(
          `No golden baseline found at ${BASELINE_PATH}. Run with UPDATE_GOLDEN=1 to create it.`,
        );
      }

      const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as { hash: string };
      assert.equal(
        hash,
        baseline.hash,
        "renderer output hash changed for a fixed input -- if this is an intentional renderer change, regenerate with UPDATE_GOLDEN=1",
      );
    },
  });
}
