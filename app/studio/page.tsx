// app/studio/page.tsx
import { BuildStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "src/lib/prisma";
import { getUserId } from "src/studio/authz";
import { getGuestBuildId } from "src/studio/permissions";

// Entering the Studio always starts at quantity 1, even when it resumes an
// earlier project (a leftover 500 from a previous visit made the first price
// look wrong). Failure to reset must never block entry.
async function resetQuantityOnEntry(buildId: string) {
  await prisma.buildDraft.updateMany({ where: { buildId, quantity: { not: 1 } }, data: { quantity: 1 } }).catch(() => null);
}

export default async function StudioPage() {
  const userId = await getUserId();

  if (userId) {
    const latestBuild = await prisma.build.findFirst({
      where: { userId, status: BuildStatus.ACTIVE },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (latestBuild) {
      await resetQuantityOnEntry(latestBuild.id);
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
      await resetQuantityOnEntry(guestBuild.id);
      redirect(`/studio/projects/${guestBuild.id}/builder`);
    }
  }

  redirect("/studio/start");
}
