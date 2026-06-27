// file: src/studio/authz.ts
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";

export async function getUserId(): Promise<string | null> {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (!sessionUserId) return null;

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true, blockedAt: true },
  });

  return user && !user.blockedAt ? user.id : null;
}

// Use ONLY at checkout
export async function requireUserId(callbackUrl: string = "/studio") {
  const userId = await getUserId();
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return userId;
}
