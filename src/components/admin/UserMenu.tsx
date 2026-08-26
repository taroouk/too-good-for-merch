"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AuthAction from "src/components/AuthAction";
import { ChevronDownIcon } from "src/components/admin/ui/icons";

function MenuOptions({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      <Link href="/" className="block px-4 py-2.5 text-sm font-medium text-admin-ink hover:bg-admin-canvas" onClick={onNavigate}>
        View store
      </Link>
      <div className="my-1 border-t border-admin-border" />
      {/* `.authActionReset` (globals.css) sets `color: inherit` and
          `background: transparent` as plain, unlayered CSS -- since
          Tailwind's utilities live inside a `@layer`, any unlayered rule
          beats them regardless of specificity or source order, so a plain
          `text-red-600` here would silently lose to the sidebar's
          `text-white` ancestor. The `!` modifier forces these two
          utilities to `!important`, which layers can't override either. */}
      <AuthAction className="authActionReset block w-full px-4 py-2.5 text-left text-sm font-medium !text-red-600 hover:!bg-red-50" />
    </>
  );
}

/**
 * `collapsed` renders as a single circular initial avatar (no label/chevron
 * fits in the 76px rail) whose dropdown opens to the *right* of the sidebar
 * instead of above it -- the same View store / Log out options stay one
 * click away without needing to expand the sidebar first.
 */
export default function UserMenu({
  email,
  dark = true,
  collapsed = false,
}: {
  email?: string | null;
  dark?: boolean;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const label = email ?? "Administrator";

  if (collapsed) {
    return (
      <div ref={ref} className="relative flex justify-center">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          title={label}
          aria-label={`Account menu for ${label}`}
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white transition hover:bg-white/20"
        >
          {label.charAt(0).toUpperCase()}
        </button>

        {open ? (
          <div className="absolute bottom-0 left-full z-40 ml-2 w-48 overflow-hidden rounded-xl border border-admin-border bg-white py-1 shadow-lg">
            <MenuOptions onNavigate={() => setOpen(false)} />
          </div>
        ) : null}
      </div>
    );
  }

  const textClass = dark ? "text-white/70 hover:text-white" : "text-admin-muted hover:text-admin-ink";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition ${textClass}`}
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-48 overflow-hidden rounded-xl border border-admin-border bg-white py-1 shadow-lg">
          <MenuOptions onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
