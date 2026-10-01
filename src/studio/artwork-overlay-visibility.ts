// file: src/studio/artwork-overlay-visibility.ts
//
// Regression fix for the "artwork gets stuck / drag stops working" bug:
// the draggable artwork <img> in BespokeModal.tsx used to be conditionally
// REMOVED from the DOM (not just hidden) whenever a fresh, non-stale
// generated mockup existed --
//
//   {artworkUrl && (!generatedMockupUrl || isMockupStale) ? <img .../> : null}
//
// Dragging is the only thing that invalidates a mockup (it calls
// discardMockups() via updateArtworkTransform), and generating a mockup is
// what makes it fresh -- so as soon as a user generated one AI mockup, the
// only element carrying onPointerDown was unmounted, and there was no way
// to ever start a drag again without some other action re-staling the
// mockup first. It looked "stuck" because it was: the interactive element
// was simply gone.
//
// The rule this module exists to enforce: whether the overlay is mounted
// MUST depend only on whether there is any artwork at all, never on mockup
// freshness.
//
// This used to also export an artworkOverlayOpacity() -- a fresh mockup
// image was rendered INTO the popup's canvas, covering the overlay, so the
// overlay stayed mounted but went transparent underneath it. That is gone:
// the popup's canvas is now permanently the flat editor tee (see
// bespoke-shirt-image.ts / editor-surface.ts) and generated mockups are
// shown on the model in the Live Model Preview outside the popup instead,
// so there is nothing in front of the overlay for it to hide behind and no
// freshness-dependent visibility left to express.

export function shouldMountArtworkOverlay(input: { artworkUrl: string | null }): boolean {
  return Boolean(input.artworkUrl);
}
