// src/studio/ui/StudioNavbar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LOGO_SRC = "/logo.svg"; // غيّر لو اسم مختلف

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-2 text-sm transition-colors rounded-md",
        active ? "font-semibold underline" : "hover:bg-gray-50 hover:underline text-gray-700"
      )}
    >
      {label}
    </Link>
  );
}

function extractBuildId(pathname: string): string | null {
  // matches: /studio/projects/<id> or /studio/projects/<id>/builder...
  const m = pathname.match(/^\/studio\/projects\/([^/]+)(?:\/|$)/);
  if (!m) return null;
  const id = m[1];
  if (!id || id === "new") return null;
  return id;
}

export default function StudioNavbar() {
  const pathname = usePathname();
  const buildId = extractBuildId(pathname);

  return (
    <header className="border-b">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/studio/projects" className="flex items-center">
            <img src={LOGO_SRC} alt="Too Good For Merch" className="h-7 w-auto" />
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink href="/studio/projects" label="Projects" />
            <NavLink href="/studio/projects/new" label="New Project" />

            {buildId ? (
              <>
                <span className="mx-2 h-5 w-px bg-gray-200" />
                <NavLink href={`/studio/projects/${buildId}`} label="Overview" />
                <NavLink href={`/studio/projects/${buildId}/builder`} label="Builder" />
                <NavLink href={`/studio/projects/${buildId}/assets`} label="Assets" />
                <NavLink href={`/studio/projects/${buildId}/designs`} label="Designs" />
                <NavLink href={`/studio/projects/${buildId}/settings`} label="Settings" />
              </>
            ) : null}
          </nav>
        </div>

        <Link className="text-sm hover:underline" href="/api/auth/signout">
          Sign out
        </Link>
      </div>
    </header>
  );
}