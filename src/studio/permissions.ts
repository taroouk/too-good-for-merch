// src/studio/permissions.ts
import {prisma} from "src/lib/prisma";

export async function assertBuildAccess(userId: string, buildId: string) {
  const build = await prisma.build.findFirst({
    where: { id: buildId, userId },
    select: { id: true },
  });
  if (!build) throw new Error("Not found");
}