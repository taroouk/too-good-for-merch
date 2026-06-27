import { NextResponse } from "next/server";
import { apiError, readJsonObject } from "src/lib/api/responses";
import { rateLimit, rateLimitHeaders } from "src/lib/rate-limit";
import { computePrice } from "src/pricing/engine";
import { normalizePlacements } from "src/pricing/placements";

const PRODUCTS = new Set(["FITTED", "OVERSIZED", "CUSTOM"]);
const FABRICS = new Set(["ESSENTIALS_170", "SIGNATURE_200", "HEAVYWEIGHT_300"]);

export async function POST(req: Request) {
  const limit = rateLimit(req, "pricing:quote", 120, 5 * 60 * 1000);
  if (!limit.ok) {
    return apiError("Too many quote requests. Please slow down.", 429, rateLimitHeaders(limit));
  }

  const body = await readJsonObject(req);
  if (!body) return apiError("Invalid JSON request.", 400);

  const productRaw = body.product;
  const fabricRaw = body.fabric;
  if (productRaw != null && (typeof productRaw !== "string" || !PRODUCTS.has(productRaw))) {
    return apiError("Invalid product.", 400);
  }
  if (fabricRaw != null && (typeof fabricRaw !== "string" || !FABRICS.has(fabricRaw))) {
    return apiError("Invalid fabric.", 400);
  }

  const product = typeof productRaw === "string" ? productRaw : null;
  const fabric = typeof fabricRaw === "string" ? fabricRaw : null;
  const quantity = Number(body?.quantity);
  const placements = normalizePlacements(body?.placements);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
    return apiError("Quantity must be between 1 and 9999.", 400);
  }

  try {
    return NextResponse.json(await computePrice({ product, fabric, quantity, placements }));
  } catch (error) {
    console.error("PRICING_QUOTE_ERROR", error);
    return apiError("Pricing is temporarily unavailable.", 500);
  }
}
