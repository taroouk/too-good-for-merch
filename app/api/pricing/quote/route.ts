import { NextResponse } from "next/server";

type Product = "FITTED" | "OVERSIZED" | "CUSTOM";
type Fabric = "ESSENTIALS_170" | "SIGNATURE_200" | "HEAVYWEIGHT_300";

type PriceRow = {
  min: number;
  max: number;
  usd: number;
};

const RANGES = [
  { min: 1, max: 10 },
  { min: 11, max: 30 },
  { min: 31, max: 50 },
  { min: 51, max: 80 },
  { min: 81, max: 100 },
  { min: 101, max: 150 },
  { min: 151, max: 200 },
  { min: 201, max: 300 },
  { min: 301, max: 400 },
  { min: 401, max: 500 },
];

const PRICES: Record<Product, Partial<Record<Fabric, number[]>>> = {
  FITTED: {
    ESSENTIALS_170: [8.02, 7.83, 7.44, 7.25, 6.87, 6.49, 5.92, 5.54, 4.96, 4.58],
    SIGNATURE_200: [9.54, 9.16, 8.4, 7.83, 7.25, 6.87, 6.3, 5.92, 5.34, 4.96],
  },

  OVERSIZED: {
    ESSENTIALS_170: [8.4, 8.21, 7.83, 7.64, 7.25, 6.87, 6.3, 5.92, 5.34, 4.96],
    SIGNATURE_200: [9.93, 9.54, 8.78, 8.21, 7.64, 7.25, 6.68, 6.3, 5.73, 5.34],
    HEAVYWEIGHT_300: [12.41, 11.07, 10.31, 9.73, 9.16, 8.78, 8.21, 7.83, 7.25, 6.87],
  },

  CUSTOM: {},
};

function getRangeIndex(quantity: number) {
  return RANGES.findIndex((r) => quantity >= r.min && quantity <= r.max);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const product = body.product as Product | null;
    const fabric = body.fabric as Fabric | null;
    const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));

    if (!product || !fabric) {
      return NextResponse.json({
        mode: "custom",
        unit: null,
        total: null,
        currency: "USD",
        message: "Select product & fabric",
      });
    }

    if (product === "CUSTOM") {
      return NextResponse.json({
        mode: "custom",
        unit: null,
        total: null,
        currency: "USD",
        message: "Custom garments require a tailored quote.",
      });
    }

    if (quantity >= 501) {
      return NextResponse.json({
        mode: "bulk",
        unit: null,
        total: null,
        currency: "USD",
        message: "We will contact you for pricing",
      });
    }

    const index = getRangeIndex(quantity);
    const unit = PRICES[product]?.[fabric]?.[index];

    if (!unit) {
      return NextResponse.json({
        mode: "custom",
        unit: null,
        total: null,
        currency: "USD",
        message: "No pricing found",
      });
    }

    return NextResponse.json({
      mode: "standard",
      unit,
      total: Number((unit * quantity).toFixed(2)),
      currency: "USD",
    });
  } catch {
    return NextResponse.json(
      {
        mode: "custom",
        unit: null,
        total: null,
        currency: "USD",
        message: "Pricing error",
      },
      { status: 500 }
    );
  }
}