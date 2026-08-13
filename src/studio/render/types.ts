// file: src/studio/render/types.ts
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";

export type GarmentSide = "front" | "back";

// Anchor convention: (xPct, yPct) is the TOP-LEFT corner of the box, as a
// fraction of template width/height. widthPct is the box width as a fraction
// of template width. heightPct is intentionally omitted for most placements:
// artwork height is derived from the artwork's own aspect ratio at the
// resolved width (matching the "height: auto" behavior the client already
// relies on), not from an independently fixed box height.
export type PlacementBox = {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct?: number;
};

export type ArtworkTransform = {
  x: number;
  y: number;
  scale: number;
  rotation?: number;
};

export type TemplateRef = {
  product: ProductType;
  color: GarmentColor;
  side: GarmentSide;
  file: string;
};

// NOTE: the redesign doc's RenderRequest sketch omits product/color, but
// placement-box geometry varies by product (FITTED vs OVERSIZED have
// different tuned coordinates — see placement-config.ts), so the renderer
// cannot resolve `placement` into pixel coordinates without them. Added
// here as a necessary, minimal correction to the documented shape.
export type RenderRequest = {
  artwork: Buffer;
  template: Buffer;
  product: ProductType;
  color: GarmentColor;
  placement: PlacementType;
  transform: ArtworkTransform;
  dpi: number;
};

export type RenderedMockup = {
  data: Buffer;
  mimeType: "image/png";
  width: number;
  height: number;
};

export interface MockupRenderer {
  render(req: RenderRequest): Promise<RenderedMockup>;
}

export type ResolvedPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
};
