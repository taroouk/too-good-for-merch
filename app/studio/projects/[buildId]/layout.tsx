// app/studio/projects/[buildId]/layout.tsx
import type { ReactNode } from "react";

export default async function ProjectLayout({
  children,
}: {
  children: ReactNode;
  params: Promise<{ buildId: string }>;
}) {
  return <>{children}</>;
}