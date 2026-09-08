// file: src/studio/ui/modals/useModalDialog.ts
import { useEffect, useRef } from "react";
import { computeTrapFocusIndex } from "./modal-a11y";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// P3-21f: every Studio modal (ArtworkModal, AuthModal, BespokeModal,
// SizeGuideModal) was a plain overlay <div> with no role="dialog"/aria-modal
// (unannounced to screen readers), no focus trap (Tab could escape into the
// page behind it), and no focus restore (closing left focus on a
// now-invisible/removed element, dropping keyboard users back at the top of
// the document). This hook is the one place all four wire that up from,
// instead of four independent, driftable implementations.
//
// Returns a ref to attach to the dialog panel element.
export function useModalDialog<T extends HTMLElement>(active: boolean) {
  const panelRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    if (panel) {
      // Move focus into the dialog on open. Prefer an element the panel
      // author marked autoFocus/first-in-tab-order; fall back to the panel
      // itself (given tabIndex=-1 by the caller) so focus always lands
      // somewhere inside the dialog, never left behind on the trigger.
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? panel).focus({ preventScroll: true });
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = computeTrapFocusIndex(activeIndex, focusable.length, event.shiftKey);
      if (nextIndex === null) return;

      event.preventDefault();
      focusable[nextIndex]?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to whatever had it before the dialog opened (typically
      // the button that triggered it), but only if that element is still
      // attached -- it may have been removed by the same action that closed
      // the dialog.
      const previous = previouslyFocusedRef.current;
      if (previous && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [active]);

  return panelRef;
}
