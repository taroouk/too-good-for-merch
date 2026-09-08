// file: src/studio/render/__tests__/sharp-renderer.test.ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { SharpMockupRenderer } from "../engines/sharp-renderer";
import { getTemplateReferenceWidth } from "../placement-config";
import { BASELINE_RENDER_DPI } from "../transform";
import type { RenderRequest } from "../types";
import { runSuite } from "./test-harness";

async function solidPng(width: number, height: number, color: { r: number; g: number; b: number; alpha?: number }) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: color.r, g: color.g, b: color.b, alpha: color.alpha ?? 1 },
    },
  })
    .png()
    .toBuffer();
}

function hash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function baseRequest(overrides: Partial<RenderRequest> = {}): Promise<RenderRequest> {
  const template = await solidPng(1000, 1000, { r: 255, g: 255, b: 255 });
  const artwork = await solidPng(200, 100, { r: 255, g: 0, b: 0 });
  return {
    artwork,
    template,
    product: "FITTED",
    color: "WHITE",
    placement: "CENTER_FRONT",
    transform: { x: 0, y: 0, scale: 1 },
    dpi: BASELINE_RENDER_DPI,
    ...overrides,
  };
}

export async function runAll() {
  const renderer = new SharpMockupRenderer();

  return runSuite("sharp-renderer", {
    async "renders without throwing and returns PNG metadata"() {
      const req = await baseRequest();
      const result = await renderer.render(req);
      assert.equal(result.mimeType, "image/png");
      assert.ok(result.width > 0 && result.height > 0);
      assert.ok(result.data.byteLength > 0);
    },

    async "is deterministic: identical input -> byte-identical output"() {
      const req = await baseRequest();
      const first = await renderer.render(req);
      const second = await renderer.render(req);
      assert.equal(hash(first.data), hash(second.data));
    },

    async "preserves artwork color at the resolved composite region"() {
      const req = await baseRequest();
      const result = await renderer.render(req);
      // Hand-computed from placement-config's CENTER_FRONT/FITTED box
      // (xPct 0.41, yPct 0.5, widthPct 0.18) against the 1000x1000 template
      // this test composites onto: left=410, top=500, width=180, height=90
      // -> sample the center. The renderer then normalizes its output
      // resolution to a canonical per-(product, side) reference width (see
      // P3-21k / getTemplateReferenceWidth) rather than leaving it at the
      // input template's own 1000x1000 resolution, so the hand-computed
      // sample point must be scaled by the same referenceWidth/1000 ratio
      // the renderer itself applies.
      const scale = getTemplateReferenceWidth(req.product, "front") / 1000;
      const sampleX = Math.round((410 + 90) * scale);
      const sampleY = Math.round((500 + 45) * scale);
      const { data, info } = await sharp(result.data)
        .extract({ left: sampleX, top: sampleY, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(info.channels >= 3, true);
      assert.equal(data[0], 255, `expected red channel 255, got ${data[0]}`);
      assert.equal(data[1], 0, `expected green channel 0, got ${data[1]}`);
      assert.equal(data[2], 0, `expected blue channel 0, got ${data[2]}`);
    },

    async "dpi scaling changes output dimensions proportionally"() {
      const baseline = await renderer.render(await baseRequest({ dpi: BASELINE_RENDER_DPI }));
      const doubled = await renderer.render(await baseRequest({ dpi: BASELINE_RENDER_DPI * 2 }));
      assert.equal(doubled.width, baseline.width * 2);
      assert.equal(doubled.height, baseline.height * 2);
    },

    async "different placements produce different output"() {
      const centerFront = await renderer.render(await baseRequest({ placement: "CENTER_FRONT" }));
      const leftChest = await renderer.render(await baseRequest({ placement: "LEFT_CHEST" }));
      assert.notEqual(hash(centerFront.data), hash(leftChest.data));
    },
  });
}
