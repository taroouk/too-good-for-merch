import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "src/lib/prisma";

export const GUEST_BUILD_COOKIE = "tgfm_guest_build";

export async function rememberGuestBuildId(id: string) {
  const cookieStore = await cookies();
  cookieStore.set(GUEST_BUILD_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getGuestBuildId() {
  const cookieStore = await cookies();
  return cookieStore.get(GUEST_BUILD_COOKIE)?.value ?? null;
}

export async function canAccessBuild(
  userId: string | null,
  build: { id: string; userId: string | null },
) {
  if (build.userId) return Boolean(userId && build.userId === userId);
  return (await getGuestBuildId()) === build.id;
}

export async function hasBuildAccess(userId: string | null, buildId: string) {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: { id: true, userId: true },
  });

  if (!build) return false;
  return canAccessBuild(userId, build);
}

export async function assertBuildAccess(
  userId: string | null,
  buildId: string
): Promise<void> {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: { id: true, userId: true },
  });

  if (!build) redirect("/studio/projects");

  if (await canAccessBuild(userId, build)) return;

  redirect("/studio/projects?guest=1");
}
