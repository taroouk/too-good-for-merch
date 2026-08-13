// file: app/api/mockups/print/route.ts
import { Role } from "@prisma/client";
import type { GarmentColor, ProductType } from "@prisma/client";
import { auth } from "src/auth";
import { apiError, apiOk, readJsonObject } from "src/lib/api/responses";
import { prisma } from "src/lib/prisma";
import { rateLimit, rateLimitHeaders } from "src/lib/rate-limit";
import { canAccessBuild } from "src/studio/permissions";
import { getArtwork, validateMockupData } from "src/lib/storage";
import {
  computeMockupFingerprint,
  getFreshPrintMockup,
  upsertPrintMockup,
} from "src/db/mockup";
import { PLACEMENTS, type PlacementKey } from "src/pricing/placements";
import {
  BASELINE_RENDER_DPI,
  getRenderer,
  getPlacementSide,
  loadTemplateBuffer,
  RendererError,
} from "src/studio/render";

export const runtime = "nodejs";

const PRODUCTS = ["FITTED", "OVERSIZED"] as const;
const COLORS = ["BLACK", "WHITE"] as const;
const DEFAULT_PREVIEW_DPI = BASELINE_RENDER_DPI;
const MAX_DPI = 300;
const MIN_DPI = 72;

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

// In-process dedup of concurrent identical requests (same draft + same
// fingerprint) so two rapid clicks don't trigger two renders. Best-effort
// only -- resets on redeploy/restart, which is fine for this purpose.
const inFlight = new Map<string, Promise<{ imageUrl: string; printMockupId: string; width: number; height: number }>>();

export async function POST(req: Request) {
  try {
    const session = await auth();

    const limitKey = session?.user?.id ?? "anon";
    const limit = rateLimit(req, `mockups:print:${limitKey}`, 20, 10 * 60 * 1000);
    if (!limit.ok) {
      return apiError("Too many print mockup requests. Please try again later.", 429, rateLimitHeaders(limit));
    }

    const body = await readJsonObject(req);
    if (!body) return apiError("Invalid JSON body.", 400);

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
    const dpiInput = numValue(body.dpi) ?? DEFAULT_PREVIEW_DPI;
    const dpi = Math.max(MIN_DPI, Math.min(MAX_DPI, dpiInput));

    if (!buildId || !draftId || !assetId) {
      return apiError("Missing buildId, draftId, or assetId.", 400);
    }
    if (!product) return apiError("Missing or invalid product.", 400);
    if (!color) return apiError("Missing or invalid color.", 400);
    if (!placement) return apiError("Missing or invalid placement.", 400);
    if (x === null || y === null || scale === null) {
      return apiError("Missing artwork transform (x, y, scale).", 400);
    }

    // Lightweight existence + ownership check only -- do not select
    // artworkData here. The BYTEA bytes are fetched exactly once, later,
    // only after authorization succeeds (see renderPromise below).
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, buildId },
      select: {
        id: true,
        build: { select: { id: true, userId: true } },
      },
    });
    if (!asset) {
      return apiError("Artwork asset not found.", 404);
    }

    const allowed =
      session?.user?.role === Role.ADMIN || (await canAccessBuild(session?.user?.id ?? null, asset.build));
    if (!allowed) {
      return apiError("Forbidden.", 403);
    }

    const fingerprint = computeMockupFingerprint({
      assetId,
      placement,
      x,
      y,
      scale,
      product,
      color,
      rotation,
      dpi,
    });

    const existing = await getFreshPrintMockup(draftId, fingerprint);
    if (existing) {
      return apiOk({
        imageUrl: existing.url,
        printMockupId: existing.id,
        fingerprint,
        cached: true,
      });
    }

    const dedupKey = `${draftId}:${fingerprint}`;
    const existingInFlight = inFlight.get(dedupKey);
    if (existingInFlight) {
      const result = await existingInFlight;
      return apiOk({ ...result, fingerprint, cached: true });
    }

    const renderPromise = (async () => {
      const artwork = await getArtwork(assetId);
      if (!artwork) {
        throw new RendererError("Artwork file missing.", 404);
      }

      const side = getPlacementSide(placement);
      const template = await loadTemplateBuffer(product as ProductType, color as GarmentColor, side);

      const rendered = await getRenderer().render({
        artwork,
        template,
        product: product as ProductType,
        color: color as GarmentColor,
        placement,
        transform: { x, y, scale, rotation },
        dpi,
      });

      const storedMimeType = validateMockupData(rendered.data, rendered.mimeType);

      const mockup = await upsertPrintMockup(draftId, {
        buildId,
        assetId,
        mimeType: storedMimeType,
        data: rendered.data,
        width: rendered.width,
        height: rendered.height,
        fingerprint,
        model: "sharp",
        placement,
        prompt: null,
      });

      return {
        imageUrl: mockup.url,
        printMockupId: mockup.id,
        width: rendered.width,
        height: rendered.height,
      };
    })();

    inFlight.set(dedupKey, renderPromise);
    try {
      const result = await renderPromise;
      return apiOk({ ...result, fingerprint });
    } finally {
      inFlight.delete(dedupKey);
    }
  } catch (err: unknown) {
    if (err instanceof RendererError) {
      return apiError(err.message, err.status);
    }
    console.error(err);
    return apiError(errorMessage(err), 500);
  }
}
