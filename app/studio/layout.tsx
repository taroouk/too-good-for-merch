// file: app/studio/layout.tsx
export const runtime = "nodejs";

import type { ReactNode } from "react";
import StudioNavbar from "src/studio/ui/StudioNavbar";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <StudioNavbar />
      <div className="p-6">{children}</div>
    </div>
  );
}