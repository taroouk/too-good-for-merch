// app/studio/projects/[buildId]/layout.tsx
import Link from "next/link";
import { ReactNode } from "react";

export default function ProjectLayout({ children, params }: { children: ReactNode; params: { buildId: string } }) {
  const { buildId } = params;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" href={`/studio/projects/${buildId}`}>
          Overview
        </Link>
        <Link className="underline" href={`/studio/projects/${buildId}/builder`}>
          Builder
        </Link>
        <Link className="underline" href={`/studio/projects/${buildId}/assets`}>
          Assets
        </Link>
        <Link className="underline" href={`/studio/projects/${buildId}/designs`}>
          Designs
        </Link>
        <Link className="underline" href={`/studio/projects/${buildId}/settings`}>
          Settings
        </Link>
      </div>
      {children}
    </div>
  );
}