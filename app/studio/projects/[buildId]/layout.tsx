import StudioNavbar from "src/studio/ui/StudioNavbar";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const projectName = "My Project";

  return (
    <div>
      <StudioNavbar
        projectId={params.id}
        projectName={projectName}
      />
      <div className="p-6">{children}</div>
    </div>
  );
}