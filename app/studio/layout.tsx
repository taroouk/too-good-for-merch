// file: app/studio/layout.tsx
export const runtime = "nodejs";

import type { ReactNode } from "react";
import StudioNavbar from "src/studio/ui/StudioNavbar";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <StudioNavbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        {children}
      </main>
    </div>
  );
}