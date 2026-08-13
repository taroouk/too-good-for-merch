// file: src/studio/render/placement-css.ts
//
// The single conversion point between the canonical placement geometry
// (placement-config.ts -- resolution-independent percentages, top-left
// anchored) and the CSS positioning shape a client preview needs (top/left/
// width applied to an absolutely-positioned <img>). No client component
// should hardcode placement percentages; consume getPlacementStyle() (or
// placementBoxToStyle() if a PlacementBox was obtained some other way,
// e.g. a surface-specific override table) instead.
//
// Deliberately NOT re-exported from ./index.ts: that barrel also re-exports
// templates.ts, which uses node:fs/promises and must never be imported by
// client code. Import this module directly by path.
//
// Anchor-convention note: placement-config.ts boxes are top-left anchored
// (xPct/yPct is the box's top-left corner, not its center), so the CSS
// output below never needs a translateX(-50%) centering transform -- the
// center-vs-top-left anchoring was already resolved when the canonical
// boxes were authored.
import type { CSSProperties } from "react";
import type { GarmentColor, PlacementType, ProductType } from "@prisma/client";
import { getPlacementBox } from "./placement-config";
import type { PlacementBox } from "./types";

export function placementBoxToStyle(box: PlacementBox): CSSProperties {
  return {
    top: `${box.yPct * 100}%`,
    left: `${box.xPct * 100}%`,
    width: `${box.widthPct * 100}%`,
    height: "auto",
  };
}

export function getPlacementStyle(
  product: ProductType,
  color: GarmentColor,
  placement: PlacementType,
): CSSProperties {
  return placementBoxToStyle(getPlacementBox(product, color, placement));
}
