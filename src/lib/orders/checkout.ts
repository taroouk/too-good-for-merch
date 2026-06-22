import { randomBytes } from "node:crypto";
import { GarmentColor, PaymentStatus, Prisma, ProductType, FabricType } from "@prisma/client";
import { prisma } from "src/lib/prisma";
import { computePrice } from "src/pricing/engine";

const PLACEMENTS = new Set([
  "LEFT_CHEST", "RIGHT_CHEST", "RIGHT_SLEEVE", "LEFT_SLEEVE",
  "CENTER_FRONT", "FULL_FRONT", "CENTER_BACK", "FULL_BACK",
]);

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type CheckoutInput = {
  buildId: string;
  customer: { name: string; email: string; phone: string };
  placements?: unknown;
  size?: unknown;
};

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateCustomer(customer: CheckoutInput["customer"]) {
  const name = cleanText(customer?.name, 120);
  const email = cleanText(customer?.email, 254).toLowerCase();
  const phone = cleanText(customer?.phone, 30).replace(/[()\s-]/g, "");
  if (name.length < 2) throw new CheckoutError("Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CheckoutError("Enter a valid email address.");
  if (!/^\+?[0-9]{8,15}$/.test(phone)) throw new CheckoutError("Enter a valid phone number including country code.");
  return { name, email, phone };
}

export async function createCheckoutOrder(userId: string, input: CheckoutInput) {
  const buildId = cleanText(input?.buildId, 128);
  if (!buildId) throw new CheckoutError("A build is required.");
  const customer = validateCustomer(input.customer);

  const build = await prisma.build.findUnique({
    where: { id: buildId },
    include: { draft: true },
  });
  if (!build?.draft) throw new CheckoutError("Build not found.", 404);
  if (build.userId && build.userId !== userId) throw new CheckoutError("You cannot checkout this build.", 403);

  const { product, fabric, color, quantity, primaryAssetId } = build.draft;
  if (!product || !fabric || !color) throw new CheckoutError("Complete the product selection before checkout.");

  const quote = await computePrice({ product, fabric, quantity });
  if (quote.mode !== "standard") throw new CheckoutError(quote.message);

  if (primaryAssetId) {
    const asset = await prisma.asset.findFirst({ where: { id: primaryAssetId, buildId }, select: { id: true } });
    if (!asset) throw new CheckoutError("The selected artwork is invalid.");
  }

  const placements = Array.isArray(input.placements)
    ? [...new Set(input.placements.filter((value): value is string => typeof value === "string" && PLACEMENTS.has(value)))].slice(0, 8)
    : [];
  const safePlacements = placements.length ? placements : ["CENTER_FRONT"];
  const size = ["S", "M", "L", "XL"].includes(String(input.size)) ? String(input.size) : "M";
  const subtotalCents = Math.round(quote.total * 100);
  const settings = await prisma.storeSetting.findUnique({ where: { id: "store" } }).catch(() => null);
  const taxCents = Math.round(subtotalCents * ((settings?.taxRateBps ?? 0) / 10_000));
  const shippingCents = Math.max(0, settings?.shippingCents ?? 0);
  const totalCents = subtotalCents + taxCents + shippingCents;
  const currency = settings?.currency ?? quote.currency;
  const orderNumber = `TGFM-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

  return prisma.$transaction(async (tx) => {
    if (!build.userId) await tx.build.update({ where: { id: buildId }, data: { userId } });
    return tx.order.create({
      data: {
        orderNumber,
        userId,
        buildId,
        currency,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        subtotalCents,
        totalCents,
        paymentStatus: PaymentStatus.PENDING,
        items: {
          create: {
            product: product as ProductType,
            fabric: fabric as FabricType,
            color: color as GarmentColor,
            quantity,
            unitPriceCents: Math.round(quote.unit * 100),
            totalCents: subtotalCents,
            placements: safePlacements,
            preview: { size, notes: cleanText(build.draft?.customNotes, 2000), taxCents, shippingCents } as Prisma.InputJsonValue,
            assetId: primaryAssetId,
          },
        },
      },
      include: { items: true },
    });
  });
}
