// file: src/lib/mockups/actor-logic.ts
//
// M3: who is calling a mockup route, decided from the DATABASE row, never from the session token. The JWT's `role` claim is
// frozen at sign-in (a demoted admin keeps "ADMIN" in it) and the token says nothing about blocking, so neither may grant
// access. Pure and Prisma-free so it can be unit tested (see src/lib/mockups/actor.ts for the lookup).
export type MockupActor = {
  // null for a guest, an unknown user, or a BLOCKED user (a blocked account is treated exactly like a signed-out visitor).
  userId: string | null;
  // true only for an ACTIVE admin per the database.
  isAdmin: boolean;
};

export const GUEST_ACTOR: MockupActor = { userId: null, isAdmin: false };

export function actorFromUserRow(
  user: { id: string; role: string; blockedAt: Date | string | null } | null | undefined,
): MockupActor {
  if (!user) return GUEST_ACTOR;
  if (user.blockedAt) return GUEST_ACTOR;
  return { userId: user.id, isAdmin: user.role === "ADMIN" };
}

// Resolves the actor through a loader (the database lookup). Any failure -- the lookup throws, a pool is exhausted, the
// database is down -- yields a guest: an error can only ever REMOVE access, never grant it.
export async function resolveActorFromLoader(
  load: () => Promise<{ id: string; role: string; blockedAt: Date | string | null } | null | undefined>,
  onError?: (error: unknown) => void,
): Promise<MockupActor> {
  try {
    return actorFromUserRow(await load());
  } catch (error) {
    onError?.(error);
    return GUEST_ACTOR;
  }
}
