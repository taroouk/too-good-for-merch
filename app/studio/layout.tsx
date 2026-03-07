// app/studio/layout.tsx
import type { ReactNode } from "react";
import StudioNavbar from "src/studio/ui/StudioNavbar";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* Navbar بدون buildId (هيدي Projects/New Project فقط) */}
      <StudioNavbar />

      <main className="px-6 py-6">{children}</main>
    </div>
  );
}