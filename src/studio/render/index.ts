// file: src/studio/render/index.ts
import { SharpMockupRenderer, renderLayeredMockup } from "./engines/sharp-renderer";
import type { MockupRenderer } from "./types";

export * from "./types";
export * from "./errors";
export * from "./placement-config";
export * from "./transform";
export * from "./templates";
export * from "./composite";
export * from "./garment-bbox";
export * from "./gemini-prompt";
export * from "./gemini-retry";

let cachedRenderer: MockupRenderer | null = null;
let cachedEngine: string | null = null;

// API routes and the Builder must only ever call getRenderer().render(...)
// - never import a specific engine (e.g. sharp-renderer.ts) directly. This
// is the seam that lets the backend swap (sharp -> canvas -> webgl -> skia)
// without touching callers.
export function getRenderer(): MockupRenderer {
  const engine = (process.env.RENDER_ENGINE ?? "sharp").trim().toLowerCase();

  if (cachedRenderer && cachedEngine === engine) {
    return cachedRenderer;
  }

  switch (engine) {
    case "sharp":
      cachedRenderer = new SharpMockupRenderer();
      break;
    default:
      throw new Error(`Unknown RENDER_ENGINE "${engine}". Supported: sharp.`);
  }

  cachedEngine = engine;
  return cachedRenderer;
}

// Several artworks on one garment side (multi-artwork designs). Exposed
// through this seam like getRenderer(); a single layer delegates to the
// active engine's own render(), so one-artwork output is unchanged.
export async function renderLayers(req: Parameters<typeof renderLayeredMockup>[0]) {
  if (req.layers.length === 1) {
    const [only] = req.layers;
    return getRenderer().render({
      artwork: only.artwork,
      template: req.template,
      product: req.product,
      color: req.color,
      placement: only.placement,
      transform: only.transform,
      dpi: req.dpi,
    });
  }
  return renderLayeredMockup(req);
}
