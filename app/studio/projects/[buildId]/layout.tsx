import type { ReactNode } from "react";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import StudioNavbar from "src/studio/ui/StudioNavbar";

type ProjectLayoutProps = {
  children: ReactNode;
  params: Promise<{
    buildId: string;
  }>;
};

export default async function ProjectLayout({
  children,
  params,
}: ProjectLayoutProps) {
  const { buildId } = await params;
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: { name: true },
  });
  const projectName = build?.name ?? "My Project";

  return (
    <div>
      <StudioNavbar projectId={buildId} projectName={projectName} />
      <div className="p-6">{children}</div>
    </div>
  );
}
