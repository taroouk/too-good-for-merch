// file: src/studio/ui/StudioNavbar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import SignOutButton from "app/studio/SignOutButton";

const LOGO_SRC = "/logo.svg";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function extractBuildId(pathname: string): string | null {
  const m = pathname.match(/^\/studio\/projects\/([^/]+)(?:\/|$)/);
  if (!m) return null;
  const id = m[1];
  if (!id || id === "new") return null;
  return id;
}

function buildAuthUrl(base: "/login" | "/register", pathname: string) {
  const callbackUrl = encodeURIComponent(pathname || "/studio/projects");
  return `${base}?callbackUrl=${callbackUrl}`;
}

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 px-2.5 py-1.5 text-sm rounded-md transition whitespace-nowrap",
        active
          ? "font-semibold underline"
          : "text-gray-700 hover:bg-gray-50 hover:underline"
      )}
    >
      {label}
    </Link>
  );
}

export default function StudioNavbar() {
  const pathname = usePathname();
  const buildId = extractBuildId(pathname);
  const { status } = useSession();
  const isAuthed = status === "authenticated";

  const projectTabs = useMemo(() => {
    if (!buildId) return [];
    const base = `/studio/projects/${buildId}`;
    return [
      { href: `${base}`, label: "Overview" },
      { href: `${base}/builder`, label: "Builder" },
      { href: `${base}/assets`, label: "Assets" },
      { href: `${base}/designs`, label: "Designs" },
      { href: `${base}/settings`, label: "Settings" },
    ];
  }, [buildId]);

  return (
    <header className="w-full border-b bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Single row: links next to logo, logo on the right (desktop) */}
        <div className="flex items-center justify-between gap-4 py-3 sm:py-4">
          {/* LEFT side: auth */}
          <div className="flex items-center gap-3 text-sm shrink-0">
            {isAuthed ? (
              <SignOutButton />
            ) : (
              <>
                <Link
                  className="hover:underline whitespace-nowrap"
                  href={buildAuthUrl("/login", pathname)}
                >
                  Login
                </Link>
                <span className="opacity-40">/</span>
                <Link
                  className="hover:underline whitespace-nowrap"
                  href={buildAuthUrl("/register", pathname)}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>

          {/* RIGHT side: nav + logo (desktop RTL-style) */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Nav links */}
            <nav
              className={cn(
                "flex items-center gap-2 min-w-0",
                // mobile: allow horizontal scroll
                "overflow-x-auto",
                // desktop: no scroll, wrap if needed
                "sm:overflow-visible sm:flex-wrap"
              )}
            >
              <NavLink href="/studio/projects" label="Projects" />
              <NavLink href="/studio/projects/new" label="New Project" />

              {projectTabs.length > 0 && (
                <>
                  <span className="mx-2 h-4 w-px bg-gray-200 shrink-0 hidden sm:block" />
                  {projectTabs.map((t) => (
                    <NavLink key={t.href} href={t.href} label={t.label} />
                  ))}
                </>
              )}
            </nav>

            {/* Logo on the right */}
            <Link href="/studio/projects" className="flex items-center gap-3 shrink-0">
              <img src={LOGO_SRC} alt="Too Good For Merch" className="h-7 w-auto" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}