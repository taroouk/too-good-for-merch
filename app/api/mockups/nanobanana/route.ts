import { Role } from "@prisma/client";
import sharp from "sharp";
import { auth } from "src/auth";
import { apiError, apiOk, readJsonObject } from "src/lib/api/responses";
import { prisma } from "src/lib/prisma";
import { rateLimit, rateLimitHeaders } from "src/lib/rate-limit";
import { canAccessBuild } from "src/studio/permissions";
import { getArtwork, validateMockupData } from "src/lib/storage";
import { computeMockupFingerprint, upsertMockupForDraft } from "src/db/mockup";
import { PLACEMENTS, type PlacementKey } from "src/pricing/placements";
import {
  BASELINE_RENDER_DPI,
  blankGarmentPrompt,
  compositeArtworkOntoBase,
  detectGarmentBBox,
  getPlacementSide,
  loadTemplateBuffer,
  remapResolvedPlacementToGarmentBBox,
  resolvePlacement,
  RendererError,
} from "src/studio/render";

export const runtime = "nodejs";

const PRODUCTS = ["FITTED", "OVERSIZED"] as const;
const COLORS = ["BLACK", "WHITE"] as const;

function numValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  if (typeof value !== "string") return null;
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : null;
}

type ParsedGeminiImage = {
  data?: string;
  mimeType: string;
  url?: string;
  location: string;
};

const GEMINI_INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

// Gemini occasionally returns its own internal "Deadline expired before
// operation could complete" error -- a transient timeout on Google's side
// that arrives as a normal HTTP error response, not a network failure or a
// timeout on our end (our own AbortSignal below never fires for this;
// Gemini responds well within it). This is a known-retryable failure
// class, so a single bounded retry is attempted before surfacing it.
// Deliberately narrow: 5xx / a "deadline"-mentioning error body only.
// Non-retryable failures (bad request, blocked prompt, bad API key, etc.)
// are returned immediately on the first attempt, exactly as before.
const MAX_GEMINI_ATTEMPTS = 2;
const GEMINI_RETRY_DELAY_MS = 1500;

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

function imageFromDataString(
  value: unknown,
  mimeType: string,
  location: string,
): ParsedGeminiImage | null {
  const raw = stringValue(value);
  if (!raw) return null;

  const dataUrlMatch = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      data: dataUrlMatch[2],
      mimeType: dataUrlMatch[1],
      location,
    };
  }

  if (/^https?:\/\//i.test(raw)) {
    return {
      url: raw,
      mimeType,
      location,
    };
  }

  if (!mimeType.startsWith("image/")) return null;

  return { data: raw, mimeType, location };
}

function mimeTypeFromBlock(block: Record<string, unknown>) {
  const explicitMimeType =
    stringValue(block.mime_type) ??
    stringValue(block.mimeType) ??
    stringValue(block.media_type) ??
    stringValue(block.mediaType) ??
    stringValue(block.contentType) ??
    stringValue(block.content_type);

  if (explicitMimeType?.startsWith("image/")) return explicitMimeType;

  const type = stringValue(block.type);
  if (type?.startsWith("image/")) return type;

  return "image/jpeg";
}

function imageFromBlock(value: unknown, location: string): ParsedGeminiImage | null {
  if (typeof value === "string") {
    return imageFromDataString(value, "image/jpeg", location);
  }

  const block = asRecord(value);
  if (!block) return null;

  const nestedImage =
    imageFromBlock(block.inlineData, `${location}.inlineData`) ??
    imageFromBlock(block.inline_data, `${location}.inline_data`) ??
    imageFromBlock(block.output_image, `${location}.output_image`) ??
    imageFromBlock(block.outputImage, `${location}.outputImage`) ??
    imageFromBlock(block.generatedImage, `${location}.generatedImage`) ??
    imageFromBlock(block.generated_image, `${location}.generated_image`);

  if (nestedImage) return nestedImage;

  const mimeType = mimeTypeFromBlock(block);
  const directData =
    block.data ??
    block.bytesBase64Encoded ??
    block.bytes_base64_encoded ??
    block.imageBytes ??
    block.image_bytes ??
    block.imageData ??
    block.image_data ??
    block.base64Data ??
    block.base64_data ??
    block.base64 ??
    block.b64_json;

  const directImage = imageFromDataString(directData, mimeType, location);
  if (directImage) return directImage;

  const directUrl =
    block.url ??
    block.uri ??
    block.imageUrl ??
    block.image_url ??
    block.outputUrl ??
    block.output_url;

  return imageFromDataString(directUrl, mimeType, location);
}

function imageFromGeneratedImages(value: unknown, location: string) {
  const images = asArray(value);

  for (let index = 0; index < images.length; index += 1) {
    const image = imageFromBlock(images[index], `${location}[${index}]`);
    if (image) return image;
  }

  return null;
}

function imageFromCandidates(value: unknown) {
  const candidates = asArray(value);

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = asRecord(candidates[candidateIndex]);
    if (!candidate) continue;

    const directCandidateImage =
      imageFromBlock(candidate.output_image, `candidates[${candidateIndex}].output_image`) ??
      imageFromBlock(candidate.outputImage, `candidates[${candidateIndex}].outputImage`) ??
      imageFromBlock(candidate.image, `candidates[${candidateIndex}].image`);
    if (directCandidateImage) return directCandidateImage;

    const content = asRecord(candidate.content);
    const parts = asArray(content?.parts ?? candidate.parts);

    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const part = parts[partIndex];
      const baseLocation = `candidates[${candidateIndex}].content.parts[${partIndex}]`;
      const image = imageFromBlock(part, baseLocation);
      if (image) return image;
    }
  }

  return null;
}

function imageFromInteractionSteps(value: unknown) {
  const steps = asArray(value);

  for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const step = asRecord(steps[stepIndex]);
    if (!step || stringValue(step.type) !== "model_output") continue;

    const contentBlocks = asArray(step.content ?? step.output ?? step.outputs);
    for (let blockIndex = contentBlocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const image = imageFromBlock(
        contentBlocks[blockIndex],
        `steps[${stepIndex}].content[${blockIndex}]`,
      );
      if (image) return image;
    }
  }

  for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const step = asRecord(steps[stepIndex]);
    if (!step) continue;

    const contentBlocks = asArray(step.content ?? step.output ?? step.outputs);
    for (let blockIndex = contentBlocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const image = imageFromBlock(
        contentBlocks[blockIndex],
        `steps[${stepIndex}].content[${blockIndex}]`,
      );
      if (image) return image;
    }
  }

  return null;
}

function imageFromAnySupportedShape(
  value: unknown,
  location = "response",
  seen = new Set<unknown>(),
): ParsedGeminiImage | null {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const direct = imageFromBlock(value, location);
  if (direct) return direct;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const image = imageFromAnySupportedShape(
        value[index],
        `${location}[${index}]`,
        seen,
      );
      if (image) return image;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const image = imageFromAnySupportedShape(record[key], `${location}.${key}`, seen);
    if (image) return image;
  }

  return null;
}

function generatedImageFromResponse(value: unknown) {
  const root = asRecord(value);
  if (!root) return null;

  return (
    imageFromBlock(root.output_image, "output_image") ??
    imageFromBlock(root.outputImage, "outputImage") ??
    imageFromBlock(root.image, "image") ??
    imageFromGeneratedImages(root.generatedImages, "generatedImages") ??
    imageFromGeneratedImages(root.generated_images, "generated_images") ??
    imageFromInteractionSteps(root.steps) ??
    imageFromCandidates(root.candidates) ??
    imageFromAnySupportedShape(root)
  );
}

// Gemini NEVER receives the artwork -- not the raw file, not a composite,
// not a screenshot, nothing that contains it. It receives exactly one
// image (the clean, artwork-free garment template) and is asked only to
// make THAT garment photorealistic. There is therefore nothing for it to
// move, resize, rotate, crop, duplicate, redraw, or reinterpret: the
// artwork doesn't exist yet at this stage of the pipeline. It gets
// composited afterward, deterministically, by compositeArtworkOntoBase()
// using the exact geometry resolvePlacement() already computed -- Gemini's
// output is only ever used as a background layer.
//
// blankGarmentPrompt() itself now lives in src/studio/render/gemini-prompt.ts
// (moved out so it has zero server-only imports and is unit-testable by the
// same harness as the rest of that module -- see its own docs for why the
// COMPOSITION LOCK section exists).

function parseGeminiJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function textFromResponsePart(value: unknown) {
  const part = asRecord(value);
  if (!part) return null;
  return stringValue(part.text) ?? stringValue(part.output_text) ?? stringValue(part.outputText);
}

function geminiTextOutput(value: unknown) {
  const root = asRecord(value);
  if (!root) return null;

  const textValues: string[] = [];
  const rootText =
    stringValue(root.output_text) ??
    stringValue(root.outputText) ??
    stringValue(root.text);
  if (rootText) textValues.push(rootText);

  for (const step of asArray(root.steps)) {
    const stepRecord = asRecord(step);
    const contentBlocks = asArray(stepRecord?.content ?? stepRecord?.output ?? stepRecord?.outputs);
    for (const block of contentBlocks) {
      const text = textFromResponsePart(block);
      if (text) textValues.push(text);
    }
  }

  for (const candidate of asArray(root.candidates)) {
    const candidateRecord = asRecord(candidate);
    const content = asRecord(candidateRecord?.content);
    const parts = asArray(content?.parts ?? candidateRecord?.parts);
    for (const part of parts) {
      const text = textFromResponsePart(part);
      if (text) textValues.push(text);
    }
  }

  return textValues.length ? textValues.join("\n").trim() : null;
}

function geminiErrorFromData(value: unknown) {
  const root = asRecord(value);
  if (!root) return null;

  const error = root.error;
  if (typeof error === "string") return error;

  const errorRecord = asRecord(error);
  const errorMessageValue =
    stringValue(errorRecord?.message) ??
    stringValue(errorRecord?.status) ??
    stringValue(errorRecord?.code);
  if (errorMessageValue) return errorMessageValue;

  const promptFeedback = asRecord(root.promptFeedback ?? root.prompt_feedback);
  const blockReason = stringValue(promptFeedback?.blockReason ?? promptFeedback?.block_reason);
  if (blockReason) return `Gemini prompt blocked: ${blockReason}`;

  for (const candidate of asArray(root.candidates)) {
    const candidateRecord = asRecord(candidate);
    const finishReason = stringValue(
      candidateRecord?.finishReason ?? candidateRecord?.finish_reason,
    );
    if (finishReason && finishReason !== "STOP") {
      return `Gemini candidate finished without an image: ${finishReason}`;
    }
  }

  return null;
}

// Narrow on purpose: only retry a failure that's actually transient.
// Server-side (5xx) statuses and Gemini's own "Deadline expired ..."
// wording (a DEADLINE_EXCEEDED-class error) are retryable; a genuine 4xx
// (bad request, blocked prompt, invalid API key) never becomes correct by
// retrying the identical request, so those still fail immediately, exactly
// as before this change.
function isRetryableGeminiFailure(status: number, responseBody: string): boolean {
  if (status >= 500) return true;
  const parsedError = geminiErrorFromData(parseGeminiJson(responseBody));
  return typeof parsedError === "string" && /deadline/i.test(parsedError);
}

function geminiFailureMessage(responseBody: string, statusText?: string) {
  const parsed = parseGeminiJson(responseBody);
  const parsedError = geminiErrorFromData(parsed);
  if (parsedError) return `Gemini failed: ${parsedError}`;

  const trimmedBody = responseBody.trim();
  if (trimmedBody) return `Gemini failed: ${trimmedBody}`;

  return statusText ? `Gemini failed: ${statusText}` : "Gemini failed.";
}

function geminiNoImageMessage(value: unknown) {
  const parsedError = geminiErrorFromData(value);
  if (parsedError) return `Gemini failed: ${parsedError}`;

  const textOutput = geminiTextOutput(value);
  if (textOutput) return `Gemini returned text instead of a mockup image: ${textOutput}`;

  return "Gemini returned no mockup image in any supported image response field.";
}

function logGeminiResponse({
  model,
  status,
  statusText,
  body,
  parsedImageLocation,
}: {
  model: string;
  status: number;
  statusText: string;
  body: string;
  parsedImageLocation: string | null;
}) {
  console.info("Nano Banana selected model:", model);
  console.info("Nano Banana Gemini response status:", {
    status,
    statusText,
  });
  console.info("Nano Banana Gemini response body:", body);
  console.info("Nano Banana parsed image location:", parsedImageLocation);
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    const limitKey = session?.user?.id ?? "anon";
    const limit = rateLimit(req, `mockups:ai:${limitKey}`, 20, 10 * 60 * 1000);
    if (!limit.ok) {
      return apiError("Too many AI mockup requests. Please try again later.", 429, rateLimitHeaders(limit));
    }

    const body = await readJsonObject(req);
    if (!body) return apiError("Invalid JSON body.", 400);

    // Same request shape as /api/mockups/print, and for the same reason:
    // artworkTransform is ephemeral client state (never persisted to
    // BuildDraft), so the server cannot know the CURRENT Studio transform
    // any other way. This is what guarantees the AI Mockup always
    // corresponds to the exact current Studio state at the moment Generate
    // is clicked -- there is no stored id to go stale, because nothing
    // about placement/geometry is read from a previous request.
    const buildId = stringValue(body.buildId);
    const draftId = stringValue(body.draftId);
    const assetId = stringValue(body.assetId);
    const product = asEnum(body.product, PRODUCTS);
    const color = asEnum(body.color, COLORS);
    const placement = asEnum(body.placement, PLACEMENTS) as PlacementKey | null;
    const x = numValue(body.x);
    const y = numValue(body.y);
    const scale = numValue(body.scale);
    const rotation = numValue(body.rotation) ?? 0;

    if (!buildId || !draftId || !assetId) {
      return apiError("Missing buildId, draftId, or assetId.", 400);
    }
    if (!product) return apiError("Missing or invalid product.", 400);
    if (!color) return apiError("Missing or invalid color.", 400);
    if (!placement) return apiError("Missing or invalid placement.", 400);
    if (x === null || y === null || scale === null) {
      return apiError("Missing artwork transform (x, y, scale).", 400);
    }

    const asset = await prisma.asset.findFirst({
      where: { id: assetId, buildId },
      select: { id: true, build: { select: { id: true, userId: true } } },
    });
    if (!asset) {
      return apiError("Artwork asset not found.", 404);
    }

    const allowed =
      session?.user?.role === Role.ADMIN || (await canAccessBuild(session?.user?.id ?? null, asset.build));
    if (!allowed) {
      return apiError("Forbidden.", 403);
    }

    // Same fingerprint shape/inputs as the print route (including the same
    // fixed dpi baseline, even though this route has no dpi concept of its
    // own) so the AI mockup's fingerprint exactly matches the print
    // mockup's fingerprint for identical state -- isAiMockupStale and
    // isPrintMockupStale compare against the same client-side value.
    const fingerprint = computeMockupFingerprint({
      assetId,
      placement,
      x,
      y,
      scale,
      product,
      color,
      rotation,
      dpi: BASELINE_RENDER_DPI,
    });

    // The ORIGINAL artwork bytes -- the only source of artwork content,
    // now and always. This buffer is used only by the local Sharp
    // post-compositor below; it is never sent to Gemini.
    const artwork = await getArtwork(assetId);
    if (!artwork) {
      return apiError("Artwork file missing.", 404);
    }

    const side = getPlacementSide(placement);
    const template = await loadTemplateBuffer(product, color, side);

    let templateMeta: sharp.Metadata;
    let artworkMeta: sharp.Metadata;
    try {
      templateMeta = await sharp(template).metadata();
      artworkMeta = await sharp(artwork).metadata();
    } catch {
      throw new RendererError("Could not read the garment template or artwork image.", 500);
    }
    if (!templateMeta.width || !templateMeta.height) {
      throw new RendererError("Garment template image is missing dimensions.", 500);
    }
    if (!artworkMeta.width || !artworkMeta.height) {
      throw new RendererError("Artwork image is missing dimensions.", 400);
    }

    // Geometry resolved ONCE, via the exact same canonical function and
    // placement config the Studio preview and the deterministic Print
    // Mockup both already use. This never talks to Gemini and is not
    // affected by anything Gemini returns.
    const resolved = resolvePlacement({
      product,
      color,
      placement,
      transform: { x, y, scale, rotation },
      templateWidth: templateMeta.width,
      templateHeight: templateMeta.height,
      artworkWidth: artworkMeta.width,
      artworkHeight: artworkMeta.height,
    });

    // The template's own garment bbox -- detected once here (not per
    // Gemini response) since it only depends on the template, which is
    // fixed for this request. See remapResolvedPlacementToGarmentBBox: this
    // is the anchor `resolved` gets re-expressed relative to, instead of
    // the full template canvas.
    const templateGarmentBBox = await detectGarmentBBox(template, {
      role: "template",
      product,
      color,
      placement,
    });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return apiError("Missing GEMINI_API_KEY.", 500);
    }

    const model = process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
    const prompt = blankGarmentPrompt({ product, color, placement });

    // Gemini receives exactly ONE image: the clean, artwork-free garment
    // template. Not the artwork, not a composite, not a screenshot -- there
    // is nothing here for it to move, resize, rotate, crop, duplicate,
    // redraw, or reinterpret. The request body is built once and reused
    // verbatim across retry attempts -- retrying never changes what's sent.
    const geminiRequestBody = JSON.stringify({
      model,
      input: [
        {
          type: "text",
          text: prompt,
        },
        {
          type: "image",
          mime_type: "image/png",
          data: template.toString("base64"),
        },
      ],
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
      },
      generation_config: {
        temperature: 0,
        top_k: 1,
      },
    });

    let geminiRes: Response;
    let responseBody: string;
    for (let attempt = 1; ; attempt++) {
      geminiRes = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: geminiRequestBody,
        signal: AbortSignal.timeout(120_000),
      });
      responseBody = await geminiRes.text();

      if (geminiRes.ok) break;

      const retryable = isRetryableGeminiFailure(geminiRes.status, responseBody);
      if (!retryable || attempt >= MAX_GEMINI_ATTEMPTS) {
        logGeminiResponse({ model, status: geminiRes.status, statusText: geminiRes.statusText, body: responseBody, parsedImageLocation: null });
        return apiError(geminiFailureMessage(responseBody, geminiRes.statusText), geminiRes.status);
      }

      await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
    }

    const data = parseGeminiJson(responseBody);
    const generated = generatedImageFromResponse(data);

    if (!generated) {
      logGeminiResponse({ model, status: geminiRes.status, statusText: geminiRes.statusText, body: responseBody, parsedImageLocation: null });
      return apiError(geminiNoImageMessage(data), 500);
    }

    logGeminiResponse({ model, status: geminiRes.status, statusText: geminiRes.statusText, body: responseBody, parsedImageLocation: generated.location });

    let geminiImage: Buffer;
    if (generated.url) {
      const remoteRes = await fetch(generated.url);
      if (!remoteRes.ok) {
        return apiError("Could not download the generated garment image.", 502);
      }
      const remoteBytes = new Uint8Array(await remoteRes.arrayBuffer());
      geminiImage = Buffer.from(remoteBytes);
    } else if (generated.data) {
      geminiImage = Buffer.from(generated.data, "base64");
    } else {
      return apiError(geminiNoImageMessage(data), 500);
    }

    // --- Deterministic post-compositor: geometry is guaranteed by code,
    // not by Gemini. Gemini's image is used purely as a background layer.
    let geminiMeta: sharp.Metadata;
    try {
      geminiMeta = await sharp(geminiImage).metadata();
    } catch {
      throw new RendererError("Gemini's garment image could not be read.", 500);
    }
    if (!geminiMeta.width || !geminiMeta.height) {
      throw new RendererError("Gemini's garment image is missing dimensions.", 500);
    }

    // Gemini is not guaranteed to preserve the template's framing -- it can
    // return the same output dimensions while still cropping/zooming/
    // repositioning the garment within them (proven by repeated-generation
    // testing, see scripts/investigate-geometry.mjs). Remapping by full
    // canvas dimensions alone (the old remapResolvedPlacement) silently
    // ignores exactly that. Detect where the garment actually landed in
    // THIS response and remap relative to it instead.
    const geminiGarmentBBox = await detectGarmentBBox(geminiImage, {
      role: "gemini-output",
      product,
      color,
      placement,
    });
    const remapped = remapResolvedPlacementToGarmentBBox(
      resolved,
      templateGarmentBBox,
      geminiGarmentBBox,
    );

    console.info("Nano Banana garment-relative remap:", {
      templateGarmentBBox,
      geminiGarmentBBox,
      resolved,
      remapped,
    });

    const finalImage = await compositeArtworkOntoBase(geminiImage, artwork, remapped);
    const storedMimeType = validateMockupData(finalImage, "image/png");

    // Best-effort lineage link to the draft's current Print Mockup (for
    // display/debugging only) -- this route's own correctness never
    // depends on the Print Mockup existing or being read.
    const draftRow = await prisma.buildDraft.findFirst({
      where: { id: draftId, buildId },
      select: { printMockupId: true },
    });

    const mockup = await upsertMockupForDraft(draftId, {
      buildId,
      assetId,
      mimeType: storedMimeType,
      data: finalImage,
      fingerprint,
      model,
      placement,
      prompt,
      parentId: draftRow?.printMockupId ?? null,
    });

    return apiOk({
      imageUrl: mockup.url,
      mockupId: mockup.id,
      model,
      fingerprint,
    });
  } catch (err: unknown) {
    if (err instanceof RendererError) {
      return apiError(err.message, err.status);
    }
    console.error(err);

    return apiError(errorMessage(err), 500);
  }
}
