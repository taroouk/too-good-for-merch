import { NextResponse } from "next/server";
import {
  FabricType,
  GarmentColor,
  OrderStatus,
  PaymentStatus,
  ProductType,
} from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";

const PRODUCT_VALUES = ["FITTED", "OVERSIZED", "CUSTOM"] as const;
const COLOR_VALUES = ["BLACK", "WHITE", "CUSTOM"] as const;
const FABRIC_VALUES = [
  "ESSENTIALS_170",
  "SIGNATURE_200",
  "HEAVYWEIGHT_300",
] as const;

type PlacementValue =
  | "LEFT_CHEST"
  | "RIGHT_CHEST"
  | "RIGHT_SLEEVE"
  | "LEFT_SLEEVE"
  | "CENTER_FRONT"
  | "FULL_FRONT"
  | "CENTER_BACK"
  | "FULL_BACK";

type CreateOrderRequestBody = {
  buildId: string;
  product: string;
  fabric: string;
  color: string;
  quantity: number;
  unitPrice: number;
  total: number;
  placements: PlacementValue[];
  assetId?: string | null;
  notes?: string | null;
};

function isProductType(value: string): value is ProductType {
  return PRODUCT_VALUES.includes(value as ProductType);
}

function isFabricType(value: string): value is FabricType {
  return FABRIC_VALUES.includes(value as FabricType);
}

function isGarmentColor(value: string): value is GarmentColor {
  return COLOR_VALUES.includes(value as GarmentColor);
}

function createOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `TGFM-${date}-${random}`;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as CreateOrderRequestBody;

    if (!body.buildId) {
      return NextResponse.json({ error: "Build ID is required." }, { status: 400 });
    }

    if (!isProductType(body.product)) {
      return NextResponse.json({ error: "Invalid product." }, { status: 400 });
    }

    if (!isFabricType(body.fabric)) {
      return NextResponse.json({ error: "Invalid fabric." }, { status: 400 });
    }

    if (!isGarmentColor(body.color)) {
      return NextResponse.json({ error: "Invalid color." }, { status: 400 });
    }

    if (!Number.isFinite(body.quantity) || body.quantity <= 0) {
      return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
    }

    if (!Number.isFinite(body.unitPrice) || body.unitPrice <= 0) {
      return NextResponse.json({ error: "Invalid unit price." }, { status: 400 });
    }

    if (!Number.isFinite(body.total) || body.total <= 0) {
      return NextResponse.json({ error: "Invalid total." }, { status: 400 });
    }

    if (!Array.isArray(body.placements) || body.placements.length === 0) {
      return NextResponse.json(
        { error: "At least one placement is required." },
        { status: 400 },
      );
    }

    const userId = await getUserId();

    await assertBuildAccess(userId, body.buildId);

    const build = await prisma.build.findUnique({
      where: { id: body.buildId },
      select: {
        id: true,
        userId: true,
        draft: {
          select: {
            primaryAssetId: true,
          },
        },
      },
    });

    if (!build) {
      return NextResponse.json({ error: "Build not found." }, { status: 404 });
    }

    const safeQuantity = Math.max(1, Math.floor(body.quantity));
    const unitPriceCents = toCents(body.unitPrice);
    const totalCents = toCents(body.total);
    const assetId = body.assetId || build.draft?.primaryAssetId || null;

    if (assetId) {
      const asset = await prisma.asset.findFirst({
        where: {
          id: assetId,
          buildId: body.buildId,
        },
        select: { id: true },
      });

      if (!asset) {
        return NextResponse.json(
          { error: "Artwork asset not found for this build." },
          { status: 400 },
        );
      }
    }

    const order = await prisma.order.create({
      data: {
        orderNumber: createOrderNumber(),
        status: OrderStatus.NEW,
        paymentStatus: PaymentStatus.UNPAID,
        currency: "EGP",
        subtotalCents: totalCents,
        totalCents,
        userId: userId ?? build.userId ?? null,
        buildId: body.buildId,
        items: {
          create: {
            assetId,
            product: body.product,
            fabric: body.fabric,
            color: body.color,
            quantity: safeQuantity,
            unitPriceCents,
            totalCents,
            placements: body.placements,
            preview: {},
          },
        },
      },
      select: {
        id: true,
        orderNumber: true,
        totalCents: true,
      },
    });

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create order.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}