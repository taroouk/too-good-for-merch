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
// The fix splits this into two independently-testable concerns:
//   - mounting: MUST NOT depend on mockup freshness, only on whether there
//     is any artwork at all -- otherwise the pointer handlers disappear.
//   - visibility (opacity): MAY depend on mockup freshness -- a fresh
//     mockup image (rendered elsewhere) should visually cover the raw
//     overlay, without removing its interactivity.

export function shouldMountArtworkOverlay(input: { artworkUrl: string | null }): boolean {
  return Boolean(input.artworkUrl);
}

export function artworkOverlayOpacity(input: {
  generatedMockupUrl: string | null;
  isMockupStale: boolean;
}): 0 | 1 {
  return !input.generatedMockupUrl || input.isMockupStale ? 1 : 0;
}
