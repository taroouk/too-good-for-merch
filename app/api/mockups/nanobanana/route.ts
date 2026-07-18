import { readFile } from "node:fs/promises";
import path from "node:path";
import { Role } from "@prisma/client";
import { auth } from "src/auth";
import { apiError, apiOk, readJsonObject } from "src/lib/api/responses";
import { prisma } from "src/lib/prisma";
import { canAccessBuild } from "src/studio/permissions";

export const runtime = "nodejs";

const SUPPORTED_INPUT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/jpg",
  "image/pjpeg",
]);

type ParsedGeminiImage = {
  data?: string;
  mimeType: string;
  url?: string;
  location: string;
};

const GEMINI_INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

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

function labelFromEnum(value: string | null, fallback: string) {
  if (!value) return fallback;
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function storageFilePath(storageKey: string) {
  const storageRoot = path.resolve(process.cwd(), "storage");
  const filePath = path.resolve(storageRoot, storageKey);

  if (filePath === storageRoot || !filePath.startsWith(`${storageRoot}${path.sep}`)) {
    return null;
  }

  return filePath;
}

function base64ByteLength(data: string) {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

function parseInlineInputImage(value: unknown, label: string) {
  const image = asRecord(value);
  if (!image) {
    return { error: apiError(`Missing ${label}.`, 400) } as const;
  }

  const rawMimeType =
    stringValue(image.mimeType) ??
    stringValue(image.mime_type) ??
    stringValue(image.mediaType) ??
    stringValue(image.media_type);
  const rawData =
    stringValue(image.data) ??
    stringValue(image.base64) ??
    stringValue(image.imageData) ??
    stringValue(image.image_data);

  if (!rawData) {
    return { error: apiError(`Missing ${label} image data.`, 400) } as const;
  }

  const dataUrlMatch = rawData.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  const mimeType = (dataUrlMatch?.[1] ?? rawMimeType ?? "").toLowerCase();
  const data = (dataUrlMatch?.[2] ?? rawData).replace(/\s/g, "");

  if (!SUPPORTED_INPUT_MIME_TYPES.has(mimeType)) {
    return {
      error: apiError(`${label} must be PNG, JPG, or WEBP.`, 400),
    } as const;
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return { error: apiError(`${label} image data must be base64.`, 400) } as const;
  }

  const byteLength = base64ByteLength(data);
  if (byteLength <= 0 || byteLength > MAX_REFERENCE_IMAGE_BYTES) {
    return {
      error: apiError(`${label} image must be smaller than 10MB.`, 400),
    } as const;
  }

  return { image: { data, mimeType } } as const;
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

function nanoBananaPrompt({
  product,
  color,
  placement,
}: {
  product: string | null;
  color: string | null;
  placement: string;
}) {
  const productLabel = labelFromEnum(product, "T-shirt");
  const colorLabel = labelFromEnum(color, "White");
  const placementLabel = labelFromEnum(placement, "Center Front");
  const view = placement.includes("BACK") ? "back" : "front";

  return `
CRITICAL INSTRUCTIONS - READ CAREFULLY:

You are performing a PIXEL-LEVEL IMAGE EDIT, not image generation.

INPUT 1 (FIRST IMAGE): A clean render of a shirt on a mannequin with a transparent background. This is the ONLY image you may modify. Every pixel in this image that is NOT part of the artwork area must remain EXACTLY identical in the output.

INPUT 2 (SECOND IMAGE): A composition reference showing the exact target appearance. Use this ONLY to determine:
- WHERE the artwork appears on the shirt
- HOW LARGE the artwork should be
- The artwork's exact aspect ratio and proportions

RULES - NO EXCEPTIONS:
1. Do NOT generate a new image. Do NOT create a new mockup. Do NOT synthesize new content.
2. Do NOT change the mannequin, model, body, pose, camera, angle, framing, or background.
3. Do NOT change the shirt's color, fabric, folds, wrinkles, shadows, or geometry.
4. Do NOT move, resize, crop, rotate, or distort the artwork.
5. Do NOT change any pixel outside the artwork area.
6. The output must have the EXACT same dimensions, composition, and visual elements as the FIRST image.

YOUR ONLY TASK:
Apply the artwork from the SECOND image onto the shirt in the FIRST image so that it looks realistically printed on the fabric. The artwork must blend naturally with the shirt's folds, lighting, and shadows while remaining fully recognizable and unchanged in content.

Garment context:
- ${colorLabel} ${productLabel}
- ${view} view
- ${placementLabel}
`.trim();
}

async function readArtworkFromAsset(buildId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, buildId },
    select: {
      url: true,
      storageKey: true,
      mimeType: true,
      build: { select: { id: true, userId: true } },
    },
  });

  if (!asset?.url || !asset.storageKey) {
    return { error: apiError("Artwork asset not found.", 404) } as const;
  }

  const session = await auth();
  const allowed =
    session?.user?.role === Role.ADMIN ||
    (await canAccessBuild(session?.user?.id ?? null, asset.build));

  if (!allowed) {
    return { error: apiError("Forbidden.", 403) } as const;
  }

  const mimeType = asset.mimeType?.toLowerCase() ?? "";
  if (!SUPPORTED_INPUT_MIME_TYPES.has(mimeType)) {
    return {
      error: apiError("Nano Banana mockups need PNG, JPG, or WEBP artwork.", 400),
    } as const;
  }

  const filePath = storageFilePath(asset.storageKey);
  if (!filePath) {
    return { error: apiError("Invalid artwork storage key.", 400) } as const;
  }

  try {
    const file = await readFile(filePath);
    return {
      artworkUrl: asset.url,
      image: {
        data: file.toString("base64"),
        mimeType,
      },
    } as const;
  } catch {
    return { error: apiError("Artwork file missing.", 404) } as const;
  }
}

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
    const body = await readJsonObject(req);
    if (!body) return apiError("Invalid JSON body.", 400);

    const buildId = stringValue(body.buildId);
    const assetId = stringValue(body.assetId);
    const product = stringValue(body.product);
    const color = stringValue(body.color);
    const placement = stringValue(body.placement);

    if (!placement) {
      return apiError("Missing placement.", 400);
    }

    if (!buildId || !assetId) {
      return apiError("Missing assetId or buildId.", 400);
    }

    const referenceImage = parseInlineInputImage(body.referenceImage, "referenceImage");
    if ("error" in referenceImage) return referenceImage.error;

    const compositeImage = parseInlineInputImage(body.compositeImage, "compositeImage");
    if ("error" in compositeImage) return compositeImage.error;

    const artwork = await readArtworkFromAsset(buildId, assetId);
    if ("error" in artwork) return artwork.error;

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return apiError("Missing GEMINI_API_KEY.", 500);
    }

    const model = process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
    const prompt = nanoBananaPrompt({ product, color, placement });

    const geminiRes = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image",
            mime_type: referenceImage.image.mimeType,
            data: referenceImage.image.data,
          },
          {
            type: "image",
            mime_type: compositeImage.image.mimeType,
            data: compositeImage.image.data,
          },
        ],
        response_format: {
          type: "image",
          mime_type: "image/png",
        },
        generation_config: {
          temperature: 0,
          top_k: 1,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const responseBody = await geminiRes.text();

    if (!geminiRes.ok) {
      logGeminiResponse({ model, status: geminiRes.status, statusText: geminiRes.statusText, body: responseBody, parsedImageLocation: null });
      return apiError(geminiFailureMessage(responseBody, geminiRes.statusText), geminiRes.status);
    }

    const data = parseGeminiJson(responseBody);
    const generated = generatedImageFromResponse(data);

    if (!generated) {
      logGeminiResponse({ model, status: geminiRes.status, statusText: geminiRes.statusText, body: responseBody, parsedImageLocation: null });
      return apiError(geminiNoImageMessage(data), 500);
    }

    logGeminiResponse({ model, status: geminiRes.status, statusText: geminiRes.statusText, body: responseBody, parsedImageLocation: generated.location });

    return apiOk({
      imageUrl: generated.url ? generated.url : `data:${generated.mimeType};base64,${generated.data}`,
      prompt,
      sourceImageUrl: artwork.artworkUrl,
      model,
    });
  } catch (err: unknown) {
    console.error(err);

    return apiError(errorMessage(err), 500);
  }
}
