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
      // The renderer applies fabric realism (fabric-shading.ts). On this
      // synthetic uniform-white template the shading transfer is provably
      // a no-op -- every pixel sits exactly at the region mean, so the
      // multiplier is exactly 1 -- which leaves ink absorption as the only
      // effect: real DTG ink soaks into cotton instead of sealing it, so
      // the print is a few percent translucent and picks up a trace of the
      // garment underneath. That is intentional, and it is bounded: the
      // customer's colour must still be unmistakably their colour, so the
      // tolerance below is tight enough that a genuine colour-management
      // regression (a wrong profile, a channel swap, a blend mode) could
      // not hide inside it.
      const inkTolerance = 12;
      assert.ok(
        data[0] >= 255 - inkTolerance,
        `expected red channel to stay saturated, got ${data[0]}`,
      );
      assert.ok(data[1] <= inkTolerance, `expected green channel near 0, got ${data[1]}`);
      assert.ok(data[2] <= inkTolerance, `expected blue channel near 0, got ${data[2]}`);
    },

    async "fabric realism never repaints the artwork: the print keeps its own hue, not the garment's"() {
      // A red print on a WHITE garment and the same red print on a BLACK
      // one must both still read as red. This is the guard against a
      // shading model that over-reaches -- e.g. a ratio-based multiplier,
      // which on a dark garment drives the print toward the fabric's own
      // luminance and quietly turns the customer's artwork into a
      // different colour. See fabric-shading.ts's header.
      for (const [color, garment] of [
        ["WHITE", { r: 255, g: 255, b: 255 }],
        ["BLACK", { r: 24, g: 24, b: 24 }],
      ] as const) {
        const req = await baseRequest({
          color,
          template: await solidPng(1000, 1000, garment),
        });
        const result = await renderer.render(req);
        const scale = getTemplateReferenceWidth(req.product, "front") / 1000;
        const { data } = await sharp(result.data)
          .extract({
            left: Math.round((410 + 90) * scale),
            top: Math.round((500 + 45) * scale),
            width: 1,
            height: 1,
          })
          .raw()
          .toBuffer({ resolveWithObject: true });
        assert.ok(
          data[0] > 200 && data[1] < 40 && data[2] < 40,
          `red artwork on a ${color} garment came out as rgb(${data[0]}, ${data[1]}, ${data[2]})`,
        );
      }
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
