// app/studio/layout.tsx
import type { ReactNode } from "react";
import StudioNavbar from "src/studio/ui/StudioNavbar";
export const runtime = "nodejs";
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <StudioNavbar />
      <main className="px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}