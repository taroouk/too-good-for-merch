// file: src/studio/ui/modals/modal-a11y.ts
//
// Pure helpers backing useModalDialog.ts, split out so the actual
// index/wrap arithmetic is unit-testable without a DOM (this repo has no
// jsdom/testing-library configured). The hook itself (DOM queries, event
// wiring, ref plumbing) is not unit-tested here; it's covered by manual
// browser verification instead.

// Given how many focusable elements are inside the dialog and which one
// currently has focus, decides where Tab / Shift+Tab should send focus so
// it never escapes the dialog. Returns null when the count is 0 (nothing to
// trap onto) or when the browser's default forward/backward tab order
// already stays inside the dialog (i.e. not at either edge) -- callers
// should only preventDefault() and refocus when this returns a number.
export function computeTrapFocusIndex(
  activeIndex: number,
  count: number,
  shiftKey: boolean,
): number | null {
  if (count <= 0) return null;
  if (shiftKey) {
    // Shift+Tab off the first (or an untracked/-1) element wraps to the last.
    return activeIndex <= 0 ? count - 1 : null;
  }
  // Tab off the last element wraps to the first.
  return activeIndex >= count - 1 ? 0 : null;
}

// A "backdrop click" is a pointer event whose target IS the overlay element
// itself, not a descendant -- i.e. the click landed in the dimmed area
// outside the panel. Using target === currentTarget (rather than a
// stopPropagation flag on the panel) means the panel can never accidentally
// suppress this by capturing/bubbling in some unrelated child interaction.
export function isBackdropClick(target: EventTarget | null, overlay: EventTarget | null): boolean {
  return target !== null && target === overlay;
}
