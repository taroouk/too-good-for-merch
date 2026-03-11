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
  params: { buildId: string };
}) {
  const { buildId } = params;

  const userId = await getUserId(); // ✅ guest allowed (string | null)
  await assertBuildAccess(userId, buildId); // ✅ owner OR guest cookie

  return (
    <div>
      <StudioNavbar />
      {children}
    </div>
  );
}