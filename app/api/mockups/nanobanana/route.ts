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

type ArtworkImage = {
  data: string;
  mimeType: string;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

function imageFromBlock(value: unknown): ArtworkImage | null {
  const block = asRecord(value);
  if (!block) return null;

  const data = stringValue(block.data);
  const mimeType =
    stringValue(block.mime_type) ??
    stringValue(block.mimeType) ??
    stringValue(block.media_type) ??
    stringValue(block.mediaType) ??
    "image/jpeg";

  if (!data || !mimeType.startsWith("image/")) return null;

  return { data, mimeType };
}

function generatedImageFromResponse(value: unknown) {
  const root = asRecord(value);
  if (!root) return null;

  return (
    imageFromBlock(root.output_image) ??
    imageFromBlock(root.outputImage) ??
    imageFromBlock(root.image)
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
Create a realistic e-commerce apparel mockup.

Use the provided image strictly as the artwork to print on the garment.

Garment:
- ${colorLabel} ${productLabel}
- ${view} view
- clean studio lighting
- plain white background
- premium cotton fabric texture

Artwork placement:
- ${placementLabel}
- keep the artwork unchanged
- preserve artwork colors, proportions, text, and details
- make it look printed naturally on fabric

Do not use the uploaded artwork as the whole mockup photo.
Do not invent a different design.
Do not add extra logos, text, watermarks, models, hands, hangers, or props.
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

async function geminiError(response: Response) {
  const text = await response.text();
  console.error("Gemini error:", text);

  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    const message = parsed.error?.message || "";

    if (
      message.toLowerCase().includes("quota") ||
      message.toLowerCase().includes("not have enough quota")
    ) {
      return "Gemini quota is finished for this API key. Please use another Gemini API key or enable billing/quota in Google AI Studio.";
    }

    return message ? `Gemini failed: ${message}` : "Gemini failed.";
  } catch {
    return "Gemini failed.";
  }
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

    const artwork = await readArtworkFromAsset(buildId, assetId);
    if ("error" in artwork) return artwork.error;

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return apiError("Missing GEMINI_API_KEY.", 500);
    }

    const model = process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
    const prompt = nanoBananaPrompt({ product, color, placement });

    const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
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
            mime_type: artwork.image.mimeType,
            data: artwork.image.data,
          },
        ],
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: "3:4",
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!geminiRes.ok) {
      return apiError(await geminiError(geminiRes), 500);
    }

    const data = await geminiRes.json();
    const generated = generatedImageFromResponse(data);

    if (!generated) {
      console.error("Gemini response without output image:", Object.keys(asRecord(data) ?? {}));
      return apiError("Gemini returned no mockup image.", 500);
    }

    return apiOk({
      imageUrl: `data:${generated.mimeType};base64,${generated.data}`,
      prompt,
      sourceImageUrl: artwork.artworkUrl,
      model,
    });
  } catch (err: unknown) {
    console.error(err);

    return apiError(errorMessage(err), 500);
  }
}
