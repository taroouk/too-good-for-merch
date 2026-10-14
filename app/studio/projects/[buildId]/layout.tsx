import type { ReactNode } from "react";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";

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

  // The Studio tabs (Builder / Wishlist / Bespoke) now live in the shared
  // site header (src/components/site/SiteHeader.tsx), which derives the
  // project id from the URL -- there is no separate Studio navbar any more.
  return (
    <div>
      <div className="p-6">{children}</div>
    </div>
  );
}
