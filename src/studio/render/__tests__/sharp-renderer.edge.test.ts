// file: src/studio/render/__tests__/sharp-renderer.edge.test.ts
import assert from "node:assert/strict";
import sharp from "sharp";
import { SharpMockupRenderer } from "../engines/sharp-renderer";
import { RendererError } from "../errors";
import type { RenderRequest } from "../types";
import { runSuite } from "./test-harness";

async function solidPng(width: number, height: number, alpha = 1) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha } },
  })
    .png()
    .toBuffer();
}

async function baseRequest(overrides: Partial<RenderRequest> = {}): Promise<RenderRequest> {
  const template = await solidPng(1000, 1000);
  const artwork = await solidPng(200, 100);
  return {
    artwork,
    template,
    product: "FITTED",
    color: "WHITE",
    placement: "CENTER_FRONT",
    transform: { x: 0, y: 0, scale: 1 },
    dpi: 150,
    ...overrides,
  };
}

export async function runAll() {
  const renderer = new SharpMockupRenderer();

  return runSuite("sharp-renderer.edge", {
    async "handles fully transparent artwork without throwing"() {
      const artwork = await solidPng(200, 200, 0);
      const req = await baseRequest({ artwork });
      const result = await renderer.render(req);
      assert.ok(result.data.byteLength > 0);
    },

    async "handles a 1x1 tiny artwork"() {
      const artwork = await solidPng(1, 1);
      const req = await baseRequest({ artwork });
      const result = await renderer.render(req);
      assert.ok(result.data.byteLength > 0);
    },

    async "handles artwork larger than the template"() {
      const artwork = await solidPng(4000, 4000);
      const req = await baseRequest({ artwork });
      const result = await renderer.render(req);
      assert.ok(result.data.byteLength > 0);
    },

    async "rejects a malformed template buffer with a RendererError, not a crash"() {
      const req = await baseRequest({ template: Buffer.from("not an image") });
      await assert.rejects(
        () => renderer.render(req),
        (err: unknown) => err instanceof RendererError,
      );
    },

    async "rejects a malformed artwork buffer with a RendererError, not a crash"() {
      const req = await baseRequest({ artwork: Buffer.from("not an image") });
      await assert.rejects(
        () => renderer.render(req),
        (err: unknown) => err instanceof RendererError,
      );
    },

    async "clamps extreme scale via resolvePlacement/validateTransform before it reaches sharp"() {
      const req = await baseRequest({ transform: { x: 0, y: 0, scale: 999 } });
      await assert.rejects(
        () => renderer.render(req),
        (err: unknown) => err instanceof RendererError,
      );
    },

    async "rejects non-finite transform values before they reach sharp"() {
      const req = await baseRequest({ transform: { x: Number.NaN, y: 0, scale: 1 } });
      await assert.rejects(
        () => renderer.render(req),
        (err: unknown) => err instanceof RendererError,
      );
    },

    async "handles a large rotation value within bounds without throwing"() {
      const req = await baseRequest({ transform: { x: 0, y: 0, scale: 1, rotation: 179 } });
      const result = await renderer.render(req);
      assert.ok(result.data.byteLength > 0);
    },
  });
}
