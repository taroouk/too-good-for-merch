#!/usr/bin/env node
// file: scripts/measure-garment-frames.mjs
//
// The measuring tape behind src/studio/render/editor-surface.ts's two
// garment-frame tables. Re-run it (and re-read the numbers off its output)
// whenever any garment image in public/images is replaced -- the frames,
// like placement-config.ts's own boxes, are measurements of specific image
// files, not universal constants.
//
//   node scripts/measure-garment-frames.mjs rows   [files...]
//   node scripts/measure-garment-frames.mjs grid   [files...]
//
// "rows" prints each image's alpha bounding box plus its horizontal extent
// sampled every ~3.5% down the canvas. That is enough to read a FLAT tee's
// frame straight off the numbers: below the sleeve hem the body's extent
// stops changing and becomes a dead-constant pair of x values (the body
// side seams), and the alpha bbox gives the shoulder line and the hem.
//
// "grid" writes tmp/grid/<name>.png -- the image with 5% gridlines (every
// 10th labelled) composited over it. A photographed MODEL template has no
// alpha edge at the garment (the model's head, arms and jeans are part of
// the same opaque subject), so its frame has to be read visually off the
// gridlines instead: torso side seam to side seam, shoulder/collar line
// down to the hem, sleeves deliberately excluded. This is the same
// "composite an overlay onto the real photo and look at it" method
// placement-config.ts's own boxes were calibrated with.
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_FILES = [
  "front -tshirt 1.png",
  "t-shirt back 1.png",
  "TGFM White.png",
  "TGFM White Back.png",
  "TGFM Black.png",
  "TGFM Black Back.png",
  "Oversized White.png",
  "Oversized White Back.png",
  "Oversized Black.png",
  "Oversized Black Back.png",
];

const ALPHA_THRESHOLD = 16;

async function rows(file) {
  const { data, info } = await sharp(path.join("public/images", file))
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  console.log(`\n== ${file}  ${width}x${height}  aspect ${(width / height).toFixed(4)}`);
  if (maxX < 0) {
    console.log("   no alpha edge -- opaque image, use `grid` and read the frame visually");
    return;
  }
  console.log(
    `   alpha bbox  x ${(minX / width).toFixed(4)}..${((maxX + 1) / width).toFixed(4)}` +
      `   y ${(minY / height).toFixed(4)}..${((maxY + 1) / height).toFixed(4)}`,
  );
  const step = Math.max(1, Math.round(height / 28));
  for (let y = 0; y < height; y += step) {
    let lo = -1, hi = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > ALPHA_THRESHOLD) {
        if (lo < 0) lo = x;
        hi = x;
      }
    }
    const extent = lo < 0 ? "        (empty)" : `${(lo / width).toFixed(3)}..${(hi / width).toFixed(3)}`;
    console.log(`   y ${(y / height).toFixed(3)}   x ${extent}`);
  }
}

async function grid(file) {
  await fs.mkdir("tmp/grid", { recursive: true });
  const base = await sharp(path.join("public/images", file))
    .flatten({ background: "#ffffff" })
    .resize({ width: 500 })
    .png()
    .toBuffer();
  const { width, height } = await sharp(base).metadata();

  let marks = "";
  for (let i = 1; i < 20; i++) {
    const major = i % 2 === 0;
    const x = (i / 20) * width;
    const y = (i / 20) * height;
    const color = major ? "#ff0000" : "#00a0ff";
    const weight = major ? 1.4 : 0.6;
    marks += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${color}" stroke-width="${weight}" opacity="0.85"/>`;
    marks += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${color}" stroke-width="${weight}" opacity="0.85"/>`;
    if (major) {
      marks += `<text x="${x + 2}" y="12" font-size="10" fill="#ff0000">${i * 5}</text>`;
      marks += `<text x="2" y="${y - 2}" font-size="10" fill="#ff0000">${i * 5}</text>`;
    }
  }

  const out = path.join("tmp/grid", `${file.replace(/[^a-z0-9]+/gi, "_")}.png`);
  await sharp(base)
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${marks}</svg>`) }])
    .png()
    .toFile(out);
  console.log(out);
}

const [mode, ...rest] = process.argv.slice(2);
const files = rest.length ? rest : DEFAULT_FILES;

if (mode === "rows") {
  for (const file of files) await rows(file);
} else if (mode === "grid") {
  for (const file of files) await grid(file);
} else {
  console.error("usage: node scripts/measure-garment-frames.mjs <rows|grid> [files...]");
  process.exitCode = 1;
}
