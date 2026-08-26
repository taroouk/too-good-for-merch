"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import UserMenu from "src/components/admin/UserMenu";
import { NAV_GROUPS, isNavItemActive } from "src/components/admin/nav-items";
import { CloseIcon } from "src/components/admin/ui/icons";

// Renders only the drawer/overlay -- the hamburger trigger lives in the
// sticky top bar (AdminShell) so there's exactly one button controlling
// this shared `open` state, not a second copy in here.
export default function MobileNav({
  email,
  open,
  onOpenChange,
}: {
  email?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => onOpenChange(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-admin-ink text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
              <span className="whitespace-nowrap text-base font-semibold">TOO GOOD FOR MERCH</span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="px-4 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-white/30">{group.label}</p>
                  <div className="space-y-1">
                    {group.items.map(({ href, label, icon: Icon }) => {
                      const active = isNavItemActive(pathname, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => onOpenChange(false)}
                          className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                            active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          <span className="truncate">{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="border-t border-white/10 p-4">
              <UserMenu email={email} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
