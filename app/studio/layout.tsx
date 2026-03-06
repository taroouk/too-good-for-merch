// app/studio/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="border-b p-4 flex items-center justify-between">
        <div className="font-semibold">Studio</div>
        <Link className="text-sm underline" href="/api/auth/signout">
          Sign out
        </Link>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}