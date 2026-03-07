// app/studio/layout.tsx
import Link from "next/link";
import type { ReactNode } from "react";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-40 border-r px-3 py-4 flex-col gap-3">
        <div className="font-semibold text-sm">Too Good For Merch</div>
        <nav className="mt-2 flex flex-col gap-2 text-sm">
          <Link className="hover:underline" href="/studio/projects">
            Projects
          </Link>
          <Link className="hover:underline" href="/studio/projects/new">
            New Project
          </Link>
        </nav>
      </aside>

      <main className="flex-1">
        <header className="border-b px-4 py-3 flex items-center justify-between">
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