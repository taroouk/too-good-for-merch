import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "src/lib/prisma";
import { signGuestBuildToken, verifyGuestBuildToken } from "src/studio/guest-token";

export const GUEST_BUILD_COOKIE = "tgfm_guest_build";

// Shared per-request lookup: a Studio project's layout.tsx and its
// page.tsx (e.g. builder/page.tsx) each independently need to verify
// build access, which previously meant two identical
// prisma.build.findUnique calls per navigation. Wrapped in React's
// cache() so both hit one query per request instead of two -- this
// duplication (compounded by other per-request Prisma calls) was
// confirmed as a contributing cause of a reproduced P2024 connection-pool
// exhaustion on the Builder route.
const getBuildAccessRecord = cache((buildId: string) =>
  prisma.build.findUnique({
    where: { id: buildId },
    select: { id: true, userId: true },
  }),
);

export async function rememberGuestBuildId(id: string) {
  const cookieStore = await cookies();
  cookieStore.set(GUEST_BUILD_COOKIE, signGuestBuildToken(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getGuestBuildId() {
  const cookieStore = await cookies();
  return verifyGuestBuildToken(cookieStore.get(GUEST_BUILD_COOKIE)?.value);
}

export async function canAccessBuild(
  userId: string | null,
  build: { id: string; userId: string | null },
) {
  if (build.userId) return Boolean(userId && build.userId === userId);
  return (await getGuestBuildId()) === build.id;
}

export async function hasBuildAccess(userId: string | null, buildId: string) {
  const build = await getBuildAccessRecord(buildId);

  if (!build) return false;
  return canAccessBuild(userId, build);
}

export async function assertBuildAccess(
  userId: string | null,
  buildId: string
): Promise<void> {
  const build = await getBuildAccessRecord(buildId);

  if (!build) redirect("/studio/projects");

  if (await canAccessBuild(userId, build)) return;

  redirect("/studio/projects?guest=1");
}
