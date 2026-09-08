import { useEffect } from "react";

// Shared by every Studio modal (ArtworkModal, AuthModal, BespokeModal,
// SizeGuideModal) -- QA found none of them closed on Escape, only via their
// explicit "x"/"Go Back" button, unlike the admin dashboard's
// UserMenu.tsx/MobileNav.tsx which already implement this. All four modals
// are always-mounted-when-rendered (the parent conditionally renders the
// component itself rather than toggling a CSS class), so there's no "open"
// flag to gate on here -- the listener's lifetime IS the mount lifetime.
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
}
