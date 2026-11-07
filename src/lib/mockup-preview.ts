// file: src/lib/mockup-preview.ts
//
// Which picture represents a customer's design on the Bag, Wishlist, Orders
// and Checkout cards. A build's mockup pointers can lag behind the design
// (the customer switched to a black Oversized shirt after the mockup of a
// white Fitted one was made), and showing that stale photo is wrong. A mockup
// is only used when its fingerprint matches the design as it is NOW (same
// artwork, placement, zoom, product and colour); otherwise the card shows the
// plain garment in the right cut and colour.
import { draftArtworkLayers, layersForSide, sideFingerprint, type ArtworkLayer } from "../studio/artwork-layers";
import { BASELINE_RENDER_DPI } from "../studio/render/transform";

type MockupPointers = {
  printMockupId?: string | null;
  printMockupFingerprint?: string | null;
  aiMockupId?: string | null;
  aiMockupFingerprint?: string | null;
};

export type PreviewDraft = MockupPointers & {
  product: string | null;
  color: string | null;
  artworkLayers?: unknown;
  primaryAssetId?: string | null;
  artworkPlacement?: unknown;
};

// What the mockup generators actually render: anything that is not literally
// OVERSIZED/BLACK renders as FITTED/WHITE.
export function mockupProduct(product: string | null): "FITTED" | "OVERSIZED" {
  return product === "OVERSIZED" ? "OVERSIZED" : "FITTED";
}
export function mockupColor(color: string | null): "BLACK" | "WHITE" {
  return color === "BLACK" ? "BLACK" : "WHITE";
}

// The plain garment photo for a cut and colour.
export function plainGarmentImage(product: string | null, color: string | null): string {
  const colour = mockupColor(color) === "BLACK" ? "Black" : "White";
  return mockupProduct(product) === "OVERSIZED" ? `/images/Oversized ${colour}.png` : `/images/TGFM ${colour}.png`;
}

// The id of a mockup that is current for this design, or null.
export function freshMockupId(draft: PreviewDraft, layers?: ArtworkLayer[]): string | null {
  const expected = sideFingerprint({
    layers: layersForSide(layers ?? draftArtworkLayers(draft), "front"),
    product: mockupProduct(draft.product),
    color: mockupColor(draft.color),
    dpi: BASELINE_RENDER_DPI,
  });
  if (!expected) return null;
  if (draft.aiMockupId && draft.aiMockupFingerprint === expected) return draft.aiMockupId;
  if (draft.printMockupId && draft.printMockupFingerprint === expected) return draft.printMockupId;
  return null;
}

// URL for the card picture: the design's own mockup when it is current,
// otherwise the plain garment in the right cut and colour.
export function designPreviewUrl(draft: PreviewDraft, layers?: ArtworkLayer[]): string {
  const id = freshMockupId(draft, layers);
  return id ? `/api/mockups/${id}/file` : plainGarmentImage(draft.product, draft.color);
}

// Order items freeze their layers and mockup ids at checkout. The picture is
// the frozen mockup when its fingerprint still matches the item's own design
// (right cut, right colour, the customer's artwork); a mismatch falls back to
// the plain garment of the ordered cut and colour. Orders from before layers
// were frozen cannot be checked and keep their recorded mockup.
export function orderItemPreviewUrl(
  item: { product: string | null; color: string | null; preview: unknown },
  mockupIds: { printMockupId: string | null; aiMockupId: string | null },
  fingerprintById: Map<string, string | null>,
  layers: ArtworkLayer[],
): string {
  const candidates = [mockupIds.aiMockupId, mockupIds.printMockupId].filter((id): id is string => Boolean(id));
  if (!layers.length) {
    return candidates.length ? `/api/mockups/${candidates[0]}/file` : plainGarmentImage(item.product, item.color);
  }
  const expected = sideFingerprint({
    layers: layersForSide(layers, "front"),
    product: mockupProduct(item.product),
    color: mockupColor(item.color),
    dpi: BASELINE_RENDER_DPI,
  });
  const match = expected ? candidates.find((id) => fingerprintById.get(id) === expected) : null;
  return match ? `/api/mockups/${match}/file` : plainGarmentImage(item.product, item.color);
}

// The mockup pointers that are current for the design, front and back. Used
// when an order freezes its snapshot, so an order never records a mockup of a
// different colour, cut or artwork than the one being bought.
export function freshMockupPointers(
  draft: PreviewDraft & {
    backPrintMockupId?: string | null;
    backPrintMockupFingerprint?: string | null;
    backAiMockupId?: string | null;
    backAiMockupFingerprint?: string | null;
  },
  layers: ArtworkLayer[],
) {
  const expected = (side: "front" | "back") =>
    sideFingerprint({
      layers: layersForSide(layers, side),
      product: mockupProduct(draft.product),
      color: mockupColor(draft.color),
      dpi: BASELINE_RENDER_DPI,
    });
  const front = expected("front");
  const back = expected("back");
  const keep = (id: string | null | undefined, fingerprint: string | null | undefined, want: string | null) =>
    id && want && fingerprint === want ? id : null;
  return {
    printMockupId: keep(draft.printMockupId, draft.printMockupFingerprint, front),
    aiMockupId: keep(draft.aiMockupId, draft.aiMockupFingerprint, front),
    backPrintMockupId: keep(draft.backPrintMockupId, draft.backPrintMockupFingerprint, back),
    backAiMockupId: keep(draft.backAiMockupId, draft.backAiMockupFingerprint, back),
  };
}
