// file: app/studio/projects/[buildId]/layout.tsx
import type { ReactNode } from "react";
import StudioNavbar from "src/studio/ui/StudioNavbar";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;

  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  return (
    <div>
      <StudioNavbar />
      {children}
    </div>
  );
}