// file: src/studio/render/templates.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GarmentColor, ProductType } from "@prisma/client";
import { RendererError } from "./errors";
import { getGarmentTemplate } from "./placement-config";
import type { GarmentSide } from "./types";

const TEMPLATE_ROOT = path.join(process.cwd(), "public", "images");

export async function loadTemplateBuffer(
  product: ProductType,
  color: GarmentColor,
  side: GarmentSide,
): Promise<Buffer> {
  const template = getGarmentTemplate(product, color, side);
  const filePath = path.join(TEMPLATE_ROOT, template.file);

  try {
    return await readFile(filePath);
  } catch {
    throw new RendererError(`Garment template file not found: ${template.file}.`, 500);
  }
}
