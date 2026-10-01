// file: src/studio/render/bespoke-shirt-image.ts
//
// Which garment image the Bespoke popup's canvas previews against.
//
// This used to resolve to one of the 8 photographed-model TEMPLATE files
// (placement-config.ts's TEMPLATE_FILES, via getGarmentTemplate) -- the
// same photos the outer Live Model Preview, the Print Mockup and the
// Gemini AI mockup are rendered against. It now resolves to the popup's
// own EDITOR SURFACE instead: the flat, laid-out t-shirt the customer
// actually designs on (src/studio/render/editor-surface.ts).
//
// The model photos stay exactly where they were for everything OUTSIDE
// the popup -- nothing about the rendered output changed. Designing on a
// flat tee and previewing on the model are reconciled by
// editor-surface.ts's garment-frame remap, not by a second coordinate
// table: the stored artwork transform is still template-space, so "what I
// built in the popup" and "what the model outside is wearing" are the same
// geometry, differing only in the garment colour the model happens to be
// wearing.
//
// product/color are still accepted (and still resolved the same way
// resolveMockupProduct/resolveMockupColor do in BuilderClient) even though
// the flat tee itself is product/colour-agnostic: the frame remap that
// positions artwork on it is not, and keeping the signature stable means
// every existing call site stays correct.
//
// No server-only imports (no node:fs, no sharp) -- safe to import directly
// from a client component, same as placement-css.ts. Deliberately not
// re-exported from index.ts (that barrel also re-exports templates.ts,
// which does node:fs/promises I/O).
import type { PlacementType } from "@prisma/client";
import { getEditorTemplateSrc } from "./editor-surface";

export function getBespokeShirtImage(
  product: string | null,
  color: string | null,
  placement: PlacementType,
): string {
  void product;
  void color;
  return getEditorTemplateSrc(placement);
}
