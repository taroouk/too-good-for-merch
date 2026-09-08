// file: src/studio/authz.ts
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";

// Wrapped in React's cache() so a single request tree (e.g. a Studio
// project's layout.tsx AND its page.tsx, which both need the current
// user) shares one DB lookup instead of each independently re-querying
// prisma.user -- confirmed via a reproduced P2024 (connection pool
// exhausted) on the Builder route that this duplication was needlessly
// doubling the query count contending for a small connection pool.
// cache() scopes per-request in Server Components, so this never leaks
// a stale value across different requests/users.
export const getUserId = cache(async (): Promise<string | null> => {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (!sessionUserId) return null;

  // A transient DB outage here must never surface as an unhandled 500 with a
  // raw Prisma stack trace (internal file paths + DB hostname) on every
  // Studio/Builder/auth-gated page -- it previously did, because this call
  // had no error handling at all. Fail CLOSED (treat as "not logged in")
  // rather than throwing: every caller of getUserId() already has
  // well-defined, safe behavior for a null return (guest fallback,
  // redirect-to-login in requireUserId, etc.), so this is the least
  // surprising way to degrade. The error is logged server-side only.
  try {
    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true, blockedAt: true },
    });

    return user && !user.blockedAt ? user.id : null;
  } catch (error) {
    console.error("getUserId: failed to look up session user (treating as signed out)", error);
    return null;
  }
});

// Use ONLY at checkout
export async function requireUserId(callbackUrl: string = "/studio") {
  const userId = await getUserId();
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return userId;
}
