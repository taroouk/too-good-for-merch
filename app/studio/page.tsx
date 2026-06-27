// app/studio/page.tsx
import { BuildStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { getGuestBuildId } from "src/studio/permissions";

export default async function StudioPage() {
  const userId = await getUserId();

  if (userId) {
    const latestBuild = await prisma.build.findFirst({
      where: { userId, status: BuildStatus.ACTIVE },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (latestBuild) {
      redirect(`/studio/projects/${latestBuild.id}/builder`);
    }

    redirect("/studio/start");
  }

  const guestBuildId = await getGuestBuildId();
  if (guestBuildId) {
    const guestBuild = await prisma.build.findFirst({
      where: { id: guestBuildId, userId: null, status: BuildStatus.ACTIVE },
      select: { id: true },
    });

    if (guestBuild) {
      redirect(`/studio/projects/${guestBuild.id}/builder`);
    }
  }

  redirect("/studio/start");
}
