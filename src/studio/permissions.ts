import { redirect } from "next/navigation";
import { prisma } from "src/lib/prisma";

export async function assertBuildAccess(
  userId: string | null,
  buildId: string
): Promise<void> {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: { userId: true },
  });

  if (!build) redirect("/studio/projects");

  if (build.userId && userId && build.userId === userId) return;

  if (!build.userId) return;

  redirect("/studio/projects?guest=1");
}