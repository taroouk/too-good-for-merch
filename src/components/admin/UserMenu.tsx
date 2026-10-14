"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronDownIcon, LogoutIcon, StoreIcon } from "src/components/admin/ui/icons";

const ITEM_CLASS =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-admin-ink/30";

function MenuOptions({ email, onNavigate }: { email: string; onNavigate: () => void }) {
  return (
    <div role="menu" aria-label="Account">
      <div className="px-4 pb-3 pt-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-admin-faint">Signed in as</p>
        <p className="mt-1 truncate text-sm font-semibold text-admin-ink" title={email}>{email}</p>
      </div>
      <div className="border-t border-admin-border p-1.5">
        <Link href="/" role="menuitem" onClick={onNavigate} className={`${ITEM_CLASS} text-admin-ink hover:bg-admin-canvas`}>
          <StoreIcon className="h-4 w-4 shrink-0 text-admin-muted" />
          View store
        </Link>
        {/* Deliberately not <AuthAction>: its `.authActionReset` class (globals.css)
            is unlayered CSS (padding: 0, text-transform: inherit) and so beats
            every Tailwind utility here, which is what pushed "LOGOUT" against
            the edge in capitals. A plain button keeps this menu self-contained. */}
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onNavigate();
            void signOut({ callbackUrl: "/admin/login" });
          }}
          className={`${ITEM_CLASS} text-red-600 hover:bg-red-50 focus-visible:ring-red-300`}
        >
          <LogoutIcon className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * `collapsed` renders as a single circular initial avatar (no label/chevron
 * fits in the 76px rail) whose dropdown opens to the *right* of the sidebar
 * instead of above it -- the same View store / Sign out options stay one
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
          <div className="absolute bottom-0 left-full z-40 ml-3 w-64 overflow-hidden rounded-2xl border border-admin-border bg-white shadow-[0_12px_40px_rgba(0,0,0,.18)]">
            <MenuOptions email={label} onNavigate={() => setOpen(false)} />
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
        <div className="absolute bottom-full left-0 z-40 mb-3 w-64 overflow-hidden rounded-2xl border border-admin-border bg-white shadow-[0_12px_40px_rgba(0,0,0,.18)]">
          <MenuOptions email={label} onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
