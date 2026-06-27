// file: app/studio/projects/[buildId]/assets/page.tsx
import { redirect } from "next/navigation";

export default async function AssetsPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;
  redirect(`/studio/projects/${buildId}/builder`);
}
