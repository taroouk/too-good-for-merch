// file: src/studio/render/index.ts
import { SharpMockupRenderer } from "./engines/sharp-renderer";
import type { MockupRenderer } from "./types";

export * from "./types";
export * from "./errors";
export * from "./placement-config";
export * from "./transform";
export * from "./templates";
export * from "./composite";

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
