#!/usr/bin/env node
// file: scripts/investigate-geometry.mjs
//
// ONE-OFF DIAGNOSTIC SCRIPT (not part of the app or its build). Investigates
// whether Gemini's photorealistic re-render preserves the same garment
// framing/crop as the clean template it was given -- the assumption
// remapResolvedPlacement's own docs state it relies on. Drives the REAL
// running dev server (same HTTP routes the browser calls, zero duplicated
// Gemini-calling/parsing logic) and reuses the REAL compiled
// resolvePlacement/remapResolvedPlacement from src/studio/render (via the
// .render-test-build output -- run `npx tsc -p scripts/render-test.tsconfig.json`
// first) so the numbers here are exactly what production would compute, not
// a hand-reimplemented approximation.
//
// Subject/garment bbox detection uses sharp's built-in trim(): the model in
// every template/output photo sits on a plain, fairly uniform backdrop, so
// trimming background-colored borders (matched against the corner pixel,
// within a threshold) isolates the photographed subject's bounding box
// without any ML/segmentation dependency. This is a proxy for "the garment"
// (the whole photographed person, not just the fabric) -- reasonable
// because the t-shirt moves rigidly with the model's torso, so subject
// framing/crop changes move the garment by the same amount.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const outDir = path.join(
  "/private/tmp/claude-501/-Volumes-F-Development-TGFM-Project-too-good-for-merch/85fc1b53-e88c-43c8-abe9-bf388dcb9fdc/scratchpad/geometry-investigation",
);

const { resolvePlacement, remapResolvedPlacement } = await import(
  path.join(repoRoot, ".render-test-build", "transform.js")
);
const { getGarmentTemplate, getPlacementSide } = await import(
  path.join(repoRoot, ".render-test-build", "placement-config.js")
);

const BASE_URL = "http://localhost:3000";
const BUILD_ID = "cmsrjuqzw0001lzdlt5fwncpk";
const DRAFT_ID = "cmsrjuqzw0003lzdlzxu9sg9e";
const ASSET_ID = "cmsrlsllm0001oa8u7s3nrvu2";
const COOKIE = `tgfm_guest_build=${BUILD_ID}`;

// Usage: node investigate-geometry.mjs [runs] [placement] [product] [color] [tag] [x] [y] [scale]
const RUNS = Number(process.argv[2] ?? 6);
const PLACEMENT = process.argv[3] ?? "FULL_FRONT";
const PRODUCT = process.argv[4] ?? "FITTED";
const COLOR = process.argv[5] ?? "WHITE";
const TAG = process.argv[6] ?? `${PLACEMENT}-${PRODUCT}-${COLOR}`;
const TRANSFORM = {
  x: Number(process.argv[7] ?? 0),
  y: Number(process.argv[8] ?? 0),
  scale: Number(process.argv[9] ?? 1),
  rotation: 0,
};

const templateRef = getGarmentTemplate(PRODUCT, COLOR, getPlacementSide(PLACEMENT));
const TEMPLATE_PATH = path.join(repoRoot, "public", "images", templateRef.file);
const ARTWORK_PATH = path.join(outDir, "marker-artwork.png");

// Subject-bbox detection, two strategies depending on the image:
//
// 1. Genuine alpha transparency (the clean template): scan the alpha
//    channel directly for the bbox of non-transparent pixels. Exact, no
//    thresholding/guessing needed.
//
// 2. Opaque photoreal image (Gemini's output -- observed to have
//    hasAlpha=true but alpha=255 everywhere, i.e. NOT actually
//    transparent): sharp's trim() removes borders similar to the actual
//    corner pixel colour (auto-detected per image, since backgrounds
//    varied between black/white/gray across runs in manual testing --
//    there is no single fixed background to assume). IMPORTANT: trim
//    metadata (trimOffsetLeft/trimOffsetTop) is only populated by actually
//    executing the pipeline (toBuffer/toFile), NOT by a bare .metadata()
//    call on an unresolved pipeline -- and the offsets sharp returns are
//    NEGATIVE (the amount to shift by), so the bbox's left/top in the
//    original image is -trimOffsetLeft/-trimOffsetTop. Verified against a
//    synthetic fixture with a known bbox before relying on it here.
async function subjectBBox(buffer) {
  const meta = await sharp(buffer).metadata();
  const { width: imageWidth, height: imageHeight } = meta;

  if (meta.hasAlpha) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    let sawRealTransparency = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * channels + 3];
        if (a < 250) sawRealTransparency = true;
        if (a > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (sawRealTransparency && maxX >= minX) {
      const left = minX, top = minY, w = maxX - minX + 1, h = maxY - minY + 1;
      return {
        imageWidth, imageHeight, left, top, width: w, height: h,
        leftFrac: left / imageWidth, topFrac: top / imageHeight,
        widthFrac: w / imageWidth, heightFrac: h / imageHeight,
        method: "alpha-scan",
      };
    }
  }

  // Opaque image: trim against whatever the actual background colour is.
  const { info: trimInfo } = await sharp(buffer).trim({ threshold: 24 }).toBuffer({ resolveWithObject: true });
  const left = -(trimInfo.trimOffsetLeft ?? 0);
  const top = -(trimInfo.trimOffsetTop ?? 0);
  const width = trimInfo.width ?? imageWidth;
  const height = trimInfo.height ?? imageHeight;
  return {
    imageWidth, imageHeight, left, top, width, height,
    leftFrac: left / imageWidth, topFrac: top / imageHeight,
    widthFrac: width / imageWidth, heightFrac: height / imageHeight,
    method: "trim",
  };
}

function fmt(n) {
  return Number(n.toFixed(4));
}

// Detects the marker artwork's own bbox by scanning for its distinctive
// magenta fill (a colour that cannot occur in a garment/skin/denim/backdrop
// photo). Independent of resolvePlacement/remapResolvedPlacement entirely --
// this is ground truth read directly from pixels, used only to check that
// our recomputed `remapped` bbox actually matches what's drawn in the image.
async function detectMagentaBBox(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (r > 180 && g < 100 && b > 180) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// Express an artwork bbox (in the SAME pixel space as `subject`) as
// fractions of the subject/garment bbox rather than the full image -- the
// metric the user asked for: position/size RELATIVE TO THE GARMENT, not the
// canvas.
function relativeToSubject(artworkBox, subject) {
  return {
    leftFrac: fmt((artworkBox.left - subject.left) / subject.width),
    topFrac: fmt((artworkBox.top - subject.top) / subject.height),
    widthFrac: fmt(artworkBox.width / subject.width),
    heightFrac: fmt(artworkBox.height / subject.height),
    centerXFrac: fmt((artworkBox.left + artworkBox.width / 2 - subject.left) / subject.width),
    centerYFrac: fmt((artworkBox.top + artworkBox.height / 2 - subject.top) / subject.height),
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const templateBuf = await readFile(TEMPLATE_PATH);
  const artworkBuf = await readFile(ARTWORK_PATH);
  const templateMeta = await sharp(templateBuf).metadata();
  const artworkMeta = await sharp(artworkBuf).metadata();

  const templateSubject = await subjectBBox(templateBuf);

  // The REAL resolvePlacement() call -- pure function of fixed inputs, so
  // computed once. This is what the client preview and the deterministic
  // Print Mockup both already use; not touched by this investigation.
  const resolved = resolvePlacement({
    product: PRODUCT,
    color: COLOR,
    placement: PLACEMENT,
    transform: TRANSFORM,
    templateWidth: templateMeta.width,
    templateHeight: templateMeta.height,
    artworkWidth: artworkMeta.width,
    artworkHeight: artworkMeta.height,
  });

  const resolvedRelToSubject = relativeToSubject(resolved, templateSubject);

  console.log(`=== [${TAG}] TEMPLATE (input to Gemini): ${templateRef.file} ===`);
  console.log("image:", templateMeta.width, "x", templateMeta.height);
  console.log("subject bbox (px):", { left: templateSubject.left, top: templateSubject.top, width: templateSubject.width, height: templateSubject.height });
  console.log("subject bbox (frac of full image):", {
    leftFrac: fmt(templateSubject.leftFrac), topFrac: fmt(templateSubject.topFrac),
    widthFrac: fmt(templateSubject.widthFrac), heightFrac: fmt(templateSubject.heightFrac),
  });
  console.log("resolvePlacement() artwork bbox (template px):", resolved);
  console.log("artwork bbox relative to SUBJECT bbox (template space):", resolvedRelToSubject);
  console.log("");

  const results = [];

  for (let i = 0; i < RUNS; i++) {
    const runLabel = `${TAG}-run${i + 1}`;
    console.log(`--- ${runLabel}: calling /api/mockups/nanobanana ---`);
    const t0 = Date.now();

    const res = await fetch(`${BASE_URL}/api/mockups/nanobanana`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: COOKIE },
      body: JSON.stringify({
        buildId: BUILD_ID,
        draftId: DRAFT_ID,
        assetId: ASSET_ID,
        placement: PLACEMENT,
        x: TRANSFORM.x,
        y: TRANSFORM.y,
        scale: TRANSFORM.scale,
        product: PRODUCT,
        color: COLOR,
      }),
    });

    const data = await res.json().catch(() => null);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    if (!res.ok || !data?.ok) {
      console.log(`${runLabel}: FAILED (${res.status}) in ${elapsed}s ->`, data?.error);
      results.push({ run: runLabel, ok: false, error: data?.error, elapsedSec: elapsed });
      continue;
    }

    const fileRes = await fetch(`${BASE_URL}${data.imageUrl}`, { headers: { Cookie: COOKIE } });
    const imageBuf = Buffer.from(await fileRes.arrayBuffer());
    const localPath = path.join(outDir, `${runLabel}.png`);
    await writeFile(localPath, imageBuf);

    const outMeta = await sharp(imageBuf).metadata();
    const outSubject = await subjectBBox(imageBuf);

    // The REAL remapResolvedPlacement() call -- exactly what
    // nanobanana/route.ts computes server-side before compositing, given
    // this run's ACTUAL Gemini output dimensions.
    const remapped = remapResolvedPlacement(
      resolved,
      templateMeta.width,
      templateMeta.height,
      outMeta.width,
      outMeta.height,
    );
    const remappedRelToSubject = relativeToSubject(remapped, outSubject);

    // Sanity cross-check: independently DETECT the artwork's actual bbox in
    // the fetched final composited image (magenta-fill colour scan -- the
    // marker artwork's fill is a colour that cannot occur anywhere else in
    // a garment/skin/denim/backdrop photo) and compare it against the
    // `remapped` bbox our own recomputation predicted. This confirms our
    // independent remap recomputation matches what the server actually
    // drew (i.e. we are measuring real production geometry, not a
    // divergent reimplementation) -- NOT a single-pixel probe, since the
    // marker artwork deliberately has a white cross at its own center,
    // which a center-pixel probe would misreport as "missing artwork".
    const detected = await detectMagentaBBox(imageBuf);
    const detectedCenterX = detected ? detected.left + detected.width / 2 : null;
    const detectedCenterY = detected ? detected.top + detected.height / 2 : null;
    const predictedCenterX = remapped.left + remapped.width / 2;
    const predictedCenterY = remapped.top + remapped.height / 2;
    const centerDeltaPx = detected
      ? Math.hypot(detectedCenterX - predictedCenterX, detectedCenterY - predictedCenterY)
      : null;
    // Tolerance: the magenta-only scan excludes the artwork's own yellow
    // border + corner markers, so a delta of a few px (border inset) is
    // expected even for a perfect remap -- flag only if it exceeds that.
    const remapMatchesActualComposite = centerDeltaPx !== null && centerDeltaPx < remapped.width * 0.08;

    const row = {
      run: runLabel,
      ok: true,
      elapsedSec: elapsed,
      fingerprint: data.fingerprint,
      geminiImage: { width: outMeta.width, height: outMeta.height },
      geminiSubjectBBoxPx: { left: outSubject.left, top: outSubject.top, width: outSubject.width, height: outSubject.height },
      geminiSubjectBBoxFrac: {
        leftFrac: fmt(outSubject.leftFrac), topFrac: fmt(outSubject.topFrac),
        widthFrac: fmt(outSubject.widthFrac), heightFrac: fmt(outSubject.heightFrac),
      },
      remappedArtworkBBoxPx: remapped,
      remappedArtworkRelToFullImage: {
        leftFrac: fmt(remapped.left / outMeta.width),
        topFrac: fmt(remapped.top / outMeta.height),
        widthFrac: fmt(remapped.width / outMeta.width),
        heightFrac: fmt(remapped.height / outMeta.height),
      },
      remappedArtworkRelToSubject: remappedRelToSubject,
      detectedArtworkBBoxPx: detected,
      // Ground truth: where the artwork ACTUALLY ended up relative to the
      // ACTUAL garment/subject bbox in this run's image, independent of any
      // remap math -- read directly from pixels. This is the number that
      // must stay stable across runs for placement to be visually correct;
      // `remappedArtworkRelToSubject` above is what the current code
      // predicts, which only matches this if the full-image-relative remap
      // assumption holds.
      detectedArtworkRelToSubject: detected ? relativeToSubject(detected, outSubject) : null,
      centerDeltaPx: centerDeltaPx === null ? null : fmt(centerDeltaPx),
      remapMatchesActualComposite,
      savedTo: localPath,
    };

    results.push(row);
    console.log(
      `${runLabel}: ok in ${elapsed}s | gemini image ${outMeta.width}x${outMeta.height} (subject method=${outSubject.method}) | subject bbox frac`,
      row.geminiSubjectBBoxFrac,
      `| predicted-vs-detected artwork center delta: ${row.centerDeltaPx}px (remap self-consistent: ${remapMatchesActualComposite})`,
    );
  }

  console.log("\n=== SUMMARY TABLE (GROUND TRUTH: artwork position/size relative to GARMENT/subject bbox, read from pixels) ===");
  console.table(
    results.filter((r) => r.ok).map((r) => ({
      run: r.run,
      geminiW: r.geminiImage.width,
      geminiH: r.geminiImage.height,
      subjLeftFrac: r.geminiSubjectBBoxFrac.leftFrac,
      subjTopFrac: r.geminiSubjectBBoxFrac.topFrac,
      subjWFrac: r.geminiSubjectBBoxFrac.widthFrac,
      subjHFrac: r.geminiSubjectBBoxFrac.heightFrac,
      artCenterXRelSubj: r.detectedArtworkRelToSubject?.centerXFrac ?? null,
      artCenterYRelSubj: r.detectedArtworkRelToSubject?.centerYFrac ?? null,
      artWRelSubj: r.detectedArtworkRelToSubject?.widthFrac ?? null,
      remapPredictedCenterX: r.remappedArtworkRelToSubject.centerXFrac,
      remapPredictedCenterY: r.remappedArtworkRelToSubject.centerYFrac,
      remapMatchesComposite: r.remapMatchesActualComposite,
    })),
  );

  console.log("\nTemplate-space artwork center relative to subject (baseline every run above should match):", {
    centerXFrac: resolvedRelToSubject.centerXFrac,
    centerYFrac: resolvedRelToSubject.centerYFrac,
    widthFrac: resolvedRelToSubject.widthFrac,
  });

  const okRuns = results.filter((r) => r.ok && r.detectedArtworkRelToSubject);
  if (okRuns.length > 1) {
    const subjWidths = okRuns.map((r) => r.geminiSubjectBBoxFrac.widthFrac);
    const subjLefts = okRuns.map((r) => r.geminiSubjectBBoxFrac.leftFrac);
    // GROUND TRUTH (pixel-detected) artwork position relative to the
    // detected garment/subject bbox -- this is the metric that must stay
    // stable across runs for placement to be visually correct on the
    // garment, per the success criterion: "AI artwork occupies the same
    // physical location and relative size on the generated garment as on
    // the original template", not "matches the mathematically predicted
    // bbox".
    const centerX = okRuns.map((r) => r.detectedArtworkRelToSubject.centerXFrac);
    const centerY = okRuns.map((r) => r.detectedArtworkRelToSubject.centerYFrac);
    const widthRel = okRuns.map((r) => r.detectedArtworkRelToSubject.widthFrac);
    const spread = (arr) => fmt(Math.max(...arr) - Math.min(...arr));
    console.log("\n=== VARIANCE ACROSS RUNS (ground truth, pixel-detected) ===");
    console.log("Gemini subject widthFrac spread (max-min):", spread(subjWidths));
    console.log("Gemini subject leftFrac spread (max-min):", spread(subjLefts));
    console.log("Artwork centerXFrac-relative-to-GARMENT spread (max-min):", spread(centerX));
    console.log("Artwork centerYFrac-relative-to-GARMENT spread (max-min):", spread(centerY));
    console.log("Artwork widthFrac-relative-to-GARMENT spread (max-min):", spread(widthRel));
  }

  const resultsPath = path.join(outDir, `results-${TAG}.json`);
  await writeFile(resultsPath, JSON.stringify({ tag: TAG, placement: PLACEMENT, product: PRODUCT, color: COLOR, transform: TRANSFORM, templateFile: templateRef.file, templateSubject, resolved, resolvedRelToSubject, results }, null, 2));
  console.log("\nFull results written to", resultsPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
