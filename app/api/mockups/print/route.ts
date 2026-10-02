// file: app/api/mockups/print/route.ts
import { Role } from "@prisma/client";
import type { GarmentColor, ProductType } from "@prisma/client";
import { auth } from "src/auth";
import { apiError, apiOk, readJsonObject } from "src/lib/api/responses";
import { prisma } from "src/lib/prisma";
import { rateLimitHeaders } from "src/lib/rate-limit";
import { rateLimit } from "src/lib/rate-limit-db";
import { canAccessBuild } from "src/studio/permissions";
import { getArtwork, validateMockupData } from "src/lib/storage";
import { getFreshPrintMockup, upsertPrintMockup } from "src/db/mockup";
import {
  normalizeArtworkLayers,
  sideFingerprint,
  sidesWithLayers,
  type ArtworkLayer,
} from "src/studio/artwork-layers";
import { PLACEMENTS, type PlacementKey } from "src/pricing/placements";
import {
  BASELINE_RENDER_DPI,
  loadTemplateBuffer,
  renderLayers,
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
    const limit = await rateLimit(req, `mockups:print:${limitKey}`, 20, 10 * 60 * 1000);
    if (!limit.ok) {
      return apiError("Too many print mockup requests. Please try again later.", 429, rateLimitHeaders(limit));
    }

    const body = await readJsonObject(req);
    if (!body) return apiError("Invalid JSON body.", 400);

    const buildId = stringValue(body.buildId);
    const draftId = stringValue(body.draftId);
    const product = asEnum(body.product, PRODUCTS);
    const color = asEnum(body.color, COLORS);
    const dpiInput = numValue(body.dpi) ?? DEFAULT_PREVIEW_DPI;
    const dpi = Math.max(MIN_DPI, Math.min(MAX_DPI, dpiInput));

    if (!buildId || !draftId) {
      return apiError("Missing buildId or draftId.", 400);
    }
    if (!product) return apiError("Missing or invalid product.", 400);
    if (!color) return apiError("Missing or invalid color.", 400);

    // Multi-artwork: `layers` (all on one garment side). The original
    // single-artwork shape (assetId + placement + x/y/scale/rotation) is
    // still accepted and treated as a one-layer design.
    let layers: ArtworkLayer[];
    if (Array.isArray(body.layers)) {
      layers = normalizeArtworkLayers(body.layers);
    } else {
      const assetId = stringValue(body.assetId);
      const placement = asEnum(body.placement, PLACEMENTS) as PlacementKey | null;
      const x = numValue(body.x);
      const y = numValue(body.y);
      const scale = numValue(body.scale);
      if (!assetId) return apiError("Missing assetId.", 400);
      if (!placement) return apiError("Missing or invalid placement.", 400);
      if (x === null || y === null || scale === null) {
        return apiError("Missing artwork transform (x, y, scale).", 400);
      }
      layers = normalizeArtworkLayers([{ assetId, placement, x, y, scale, rotation: numValue(body.rotation) ?? 0 }]);
    }
    if (!layers.length) return apiError("No artwork to render.", 400);
    const sides = sidesWithLayers(layers);
    if (sides.length !== 1) {
      return apiError("All artworks in one print mockup must be on the same side.", 400);
    }
    const side = sides[0];

    // Lightweight existence + ownership check only -- do not select
    // artworkData here. The BYTEA bytes are fetched exactly once, later,
    // only after authorization succeeds (see renderPromise below).
    const assetIds = [...new Set(layers.map((layer) => layer.assetId))];
    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds }, buildId },
      select: {
        id: true,
        build: { select: { id: true, userId: true } },
      },
    });
    if (assets.length !== assetIds.length) {
      return apiError("Artwork asset not found.", 404);
    }

    const allowed =
      session?.user?.role === Role.ADMIN || (await canAccessBuild(session?.user?.id ?? null, assets[0].build));
    if (!allowed) {
      return apiError("Forbidden.", 403);
    }

    const fingerprint = sideFingerprint({ layers, product, color, dpi }) as string;

    const existing = await getFreshPrintMockup(draftId, fingerprint, side);
    if (existing) {
      return apiOk({
        imageUrl: existing.url,
        printMockupId: existing.id,
        fingerprint,
        side,
        cached: true,
      });
    }

    const dedupKey = `${draftId}:${side}:${fingerprint}`;
    const existingInFlight = inFlight.get(dedupKey);
    if (existingInFlight) {
      const result = await existingInFlight;
      return apiOk({ ...result, fingerprint, side, cached: true });
    }

    const renderPromise = (async () => {
      const artworkByAsset = new Map<string, Buffer>();
      for (const id of assetIds) {
        const artwork = await getArtwork(id);
        if (!artwork) throw new RendererError("Artwork file missing.", 404);
        artworkByAsset.set(id, artwork);
      }

      const template = await loadTemplateBuffer(product as ProductType, color as GarmentColor, side);

      const rendered = await renderLayers({
        template,
        product: product as ProductType,
        color: color as GarmentColor,
        layers: layers.map((layer) => ({
          artwork: artworkByAsset.get(layer.assetId) as Buffer,
          placement: layer.placement,
          transform: { x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation },
        })),
        dpi,
      });

      const storedMimeType = validateMockupData(rendered.data, rendered.mimeType);

      const mockup = await upsertPrintMockup(draftId, {
        buildId,
        assetId: layers[0].assetId,
        mimeType: storedMimeType,
        data: rendered.data,
        width: rendered.width,
        height: rendered.height,
        fingerprint,
        model: "sharp",
        placement: layers.map((layer) => layer.placement).join(","),
        prompt: null,
        side,
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
      return apiOk({ ...result, fingerprint, side });
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
