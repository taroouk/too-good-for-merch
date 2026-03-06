// src/pricing/engine.ts
import type { FabricType, GarmentColor, ProductType } from "@prisma/client";

export type PricingInput = {
  product: ProductType | null;
  color: GarmentColor | null;
  fabric: FabricType | null;
  quantity: number;
  placementsCount: number;
};

export function computePriceStub(input: PricingInput): { unit: number; total: number; currency: "EGP" } {
  const qty = Math.max(1, Math.floor(input.quantity || 1));

  let base = 0;
  if (input.product === "FITTED") base += 450;
  if (input.product === "OVERSIZED") base += 520;
  if (input.product === "CUSTOM") base += 0;

  if (input.fabric === "ESSENTIALS_170") base += 0;
  if (input.fabric === "SIGNATURE_200") base += 60;
  if (input.fabric === "HEAVYWEIGHT_300") base += 120;

  const placementsFee = Math.max(0, input.placementsCount) * 80;

  const unit = Math.max(0, base + placementsFee);
  const total = unit * qty;
  return { unit, total, currency: "EGP" };
}