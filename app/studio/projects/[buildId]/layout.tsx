import type { ReactNode } from "react";
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

  const projectName = "My Project";

  return (
    <div>
      <StudioNavbar projectId={buildId} projectName={projectName} />
      <div className="p-6">{children}</div>
    </div>
  );
}