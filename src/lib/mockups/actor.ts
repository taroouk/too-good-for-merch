// file: src/lib/mockups/actor.ts
//
// M3: resolves the caller of /api/mockups/* from the database (one query), so a user blocked or demoted after sign-in loses
// access immediately instead of when their token expires. Fails CLOSED: a lookup error is treated as a signed-out visitor.
import { auth } from "src/auth";
import { prisma } from "src/lib/prisma";
import { GUEST_ACTOR, resolveActorFromLoader, type MockupActor } from "src/lib/mockups/actor-logic";

export async function resolveMockupActor(): Promise<MockupActor> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return GUEST_ACTOR;
  return resolveActorFromLoader(
    () => prisma.user.findUnique({ where: { id }, select: { id: true, role: true, blockedAt: true } }),
    (error) => console.error("resolveMockupActor: user lookup failed (treating as signed out)", error),
  );
}
