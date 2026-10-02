// file: src/studio/render/__tests__/square-frame.test.ts
//
// Regression: Gemini always answers with a SQUARE image. Stretching it onto
// a tall garment crop elongated the model's face and body in AI mockups
// (Oversized, whose crop is ~0.51 wide/tall). The crop is now sent centred
// on a white square and cut back out of the square answer.
import assert from "node:assert/strict";
import sharp from "sharp";
import { cropOutOfSquare, padCropToSquare, squareFrameFor } from "../composite";
import { runSuite } from "./test-harness";

async function circleOnCrop(width: number, height: number) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#e11d48"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function redBox(png: Buffer) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const o = (y * info.width + x) * info.channels;
    if (data[o] > 200 && data[o + 1] < 80 && data[o + 2] < 120) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}

export async function runAll() {
  return runSuite("render/square-frame", {
    "the frame is the longer side, with the crop centred"() {
      assert.deepEqual(squareFrameFor(603, 1185), { side: 1185, padX: 291, padY: 0, width: 603, height: 1185 });
      assert.deepEqual(squareFrameFor(800, 600), { side: 800, padX: 0, padY: 100, width: 800, height: 600 });
      assert.deepEqual(squareFrameFor(500, 500), { side: 500, padX: 0, padY: 0, width: 500, height: 500 });
    },

    async "padding then cutting out returns the crop's exact shape and content"() {
      const frame = squareFrameFor(603, 1185);
      const crop = await circleOnCrop(603, 1185);
      const square = await padCropToSquare(crop, frame);
      const sm = await sharp(square).metadata();
      assert.equal(sm.width, 1185);
      assert.equal(sm.height, 1185);
      const back = await cropOutOfSquare(square, frame);
      const bm = await sharp(back).metadata();
      assert.equal(bm.width, 603);
      assert.equal(bm.height, 1185);
      // The circle stays a circle: no stretching.
      const box = await redBox(back);
      assert.ok(Math.abs(box.w - box.h) <= 2, `circle distorted: ${box.w}x${box.h}`);
    },

    async "a square answer of a different pixel size still lines up (Gemini returns 1024x1024)"() {
      const frame = squareFrameFor(603, 1185);
      const square = await padCropToSquare(await circleOnCrop(603, 1185), frame);
      const gemini = await sharp(square).resize(1024, 1024, { fit: "fill" }).toBuffer();
      const back = await cropOutOfSquare(gemini, frame);
      const bm = await sharp(back).metadata();
      assert.equal(bm.width, 603);
      assert.equal(bm.height, 1185);
      const box = await redBox(back);
      assert.ok(Math.abs(box.w - box.h) <= 3, `circle distorted: ${box.w}x${box.h}`);
    },
  });
}
