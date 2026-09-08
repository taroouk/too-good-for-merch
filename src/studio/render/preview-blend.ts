// file: src/studio/render/preview-blend.ts

export type PreviewArtworkBlend = {
  mixBlendMode: "normal";
  opacity: number;
};

// P3-21b: the browser preview must composite artwork exactly the way the
// server does, otherwise the customer approves something different from what
// gets printed. compositeArtworkOntoBase (src/studio/render/composite.ts)
// calls sharp's .composite() with no `blend` option, which is plain
// alpha-over at full opacity -- verified: compositing 50%-alpha mid-grey onto
// white yields R=191 (alpha-over), where multiply would yield R=159.
//
// The preview previously applied `mix-blend-mode: multiply` and `opacity:
// 0.95` when the garment color was WHITE, which darkened the artwork on
// screen relative to the delivered render. Garment color must not influence
// preview compositing at all, so this takes the color and deliberately
// ignores it -- the signature keeps the invariant explicit and testable
// against every color rather than leaving it as an implicit convention.
export function previewArtworkBlend(_garmentColor?: string | null): PreviewArtworkBlend {
  return { mixBlendMode: "normal", opacity: 1 };
}
