// app/studio/layout.tsx
import Link from "next/link";
import type { ReactNode } from "react";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r p-4 hidden md:block">
        <div className="font-semibold text-lg">Too Good For Merch</div>
        <nav className="mt-6 space-y-2 text-sm">
          <Link className="block hover:underline" href="/studio/projects">
            Projects
          </Link>
          <Link className="block hover:underline" href="/studio/projects/new">
            New Project
          </Link>
        </nav>
      </aside>

      <main className="flex-1">
        <header className="border-b p-4 flex items-center justify-between">
          <div className="font-medium">Studio</div>
          <Link className="text-sm hover:underline" href="/api/auth/signout">
            Sign out
          </Link>
        </header>

        <div className="p-4">{children}</div>
      </main>
    </div>
  );
}