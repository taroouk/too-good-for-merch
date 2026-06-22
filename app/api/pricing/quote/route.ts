import { NextResponse } from "next/server";
import { computePrice } from "src/pricing/engine";

const PRODUCTS = new Set(["FITTED", "OVERSIZED", "CUSTOM"]);
const FABRICS = new Set(["ESSENTIALS_170", "SIGNATURE_200", "HEAVYWEIGHT_300"]);

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const product = typeof body?.product === "string" && PRODUCTS.has(body.product) ? body.product : null;
  const fabric = typeof body?.fabric === "string" && FABRICS.has(body.fabric) ? body.fabric : null;
  const quantity = Number(body?.quantity);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
    return NextResponse.json({ error: "Quantity must be between 1 and 9999." }, { status: 400 });
  }

  return NextResponse.json(await computePrice({ product, fabric, quantity }));
}
