"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A <details> disclosure (summary button + panel) that behaves like a real
// popup: it closes itself after its form is submitted, when you click
// elsewhere, and on Escape. A plain <details> keeps its open state across
// the page refresh that follows a server action, so "Edit" panels used to
// stay open after Save.
export default function DetailsPopover({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const el = ref.current;
      if (el?.open && !el.contains(event.target as Node)) el.open = false;
    }
    function onKeyDown(event: KeyboardEvent) {
      const el = ref.current;
      if (event.key === "Escape" && el?.open) {
        el.open = false;
        el.querySelector<HTMLElement>("summary")?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details
      ref={ref}
      className={className}
      // Close once the submit event has been handled (the form still posts:
      // a closed <details> only hides its content, it doesn't remove it).
      onSubmit={() => {
        window.setTimeout(() => {
          if (ref.current) ref.current.open = false;
        }, 0);
      }}
    >
      {children}
    </details>
  );
}
