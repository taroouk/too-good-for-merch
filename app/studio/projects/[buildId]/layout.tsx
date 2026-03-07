// app/studio/projects/[buildId]/layout.tsx
import type { ReactNode } from "react";
import StudioNavbar from "src/studio/ui/StudioNavbar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;

  return (
    <div>
      {/* Navbar هنا بيطلع كمان Overview/Builder/Assets/Designs/Settings */}
      <StudioNavbar buildId={buildId} />

      <main className="px-6 py-6">{children}</main>
    </div>
  );
}