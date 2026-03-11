// file: src/studio/permissions.ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "src/lib/prisma";

const GUEST_BUILDS_COOKIE = "tgfm_guest_builds";

function parseGuestBuildIds(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

async function getGuestBuildIds(): Promise<Set<string>> {
  const jar = await cookies();
  const raw = jar.get(GUEST_BUILDS_COOKIE)?.value;
  return parseGuestBuildIds(raw);
}

export async function rememberGuestBuildId(buildId: string): Promise<void> {
  const jar = await cookies();
  const set = await getGuestBuildIds();
  set.add(buildId);

  jar.set(GUEST_BUILDS_COOKIE, JSON.stringify(Array.from(set)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

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

  if (!build.userId) {
    const guestIds = await getGuestBuildIds();
    if (guestIds.has(buildId)) return;
  }

  redirect("/studio/projects?guest=1");
}