// file: app/studio/projects/[buildId]/designs/page.tsx
import { redirect } from "next/navigation";

export default async function DesignsPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;
  redirect(`/studio/projects/${buildId}/builder`);
}
