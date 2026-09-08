// file: src/studio/render/templates.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GarmentColor, ProductType } from "@prisma/client";
import { RendererError } from "./errors";
import { getGarmentTemplate } from "./placement-config";
import type { GarmentSide } from "./types";

const TEMPLATE_ROOT = path.join(process.cwd(), "public", "images");

// Template PNGs are static, baked-in build assets (a fixed set of ~8 files,
// never modified at runtime) but every mockup-generation request that isn't
// an exact-fingerprint cache hit used to re-read one from disk from scratch
// -- see P3-21h. Cache the resolved Buffer per file name at module scope so
// repeat requests for the same garment/color/side reuse the same in-memory
// bytes instead of paying disk I/O every time. Caching the in-flight promise
// (not just the resolved value) also collapses concurrent first-requests for
// the same file into a single read.
const templateBufferCache = new Map<string, Promise<Buffer>>();

export async function loadTemplateBuffer(
  product: ProductType,
  color: GarmentColor,
  side: GarmentSide,
): Promise<Buffer> {
  const template = getGarmentTemplate(product, color, side);

  const cached = templateBufferCache.get(template.file);
  if (cached) return cached;

  const filePath = path.join(TEMPLATE_ROOT, template.file);
  const pending = readFile(filePath).catch((): never => {
    // Don't cache a rejected promise -- a transient failure (e.g. disk
    // pressure) shouldn't permanently poison the cache for this file.
    templateBufferCache.delete(template.file);
    throw new RendererError(`Garment template file not found: ${template.file}.`, 500);
  });
  templateBufferCache.set(template.file, pending);
  return pending;
}
