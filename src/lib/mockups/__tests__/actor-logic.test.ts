// file: src/lib/mockups/__tests__/actor-logic.test.ts
//
// M3 regression: the mockup routes used `session.user.role === ADMIN` (a token claim frozen at sign-in) and a session user id that
// was never checked for blocking. The caller is now derived from the database row.
import assert from "node:assert/strict";
import { actorFromUserRow, GUEST_ACTOR, resolveActorFromLoader } from "../actor-logic";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/mockups/actor-logic", {
    "an active admin is an admin"() {
      assert.deepEqual(actorFromUserRow({ id: "u1", role: "ADMIN", blockedAt: null }), { userId: "u1", isAdmin: true });
    },
    "an admin who was DEMOTED since signing in is a normal user, not an admin (the stale token claim is irrelevant)"() {
      assert.deepEqual(actorFromUserRow({ id: "u1", role: "USER", blockedAt: null }), { userId: "u1", isAdmin: false });
    },
    "a BLOCKED user is treated as signed out, with no admin rights even if the row still says ADMIN"() {
      assert.deepEqual(actorFromUserRow({ id: "u1", role: "USER", blockedAt: new Date() }), GUEST_ACTOR);
      assert.deepEqual(actorFromUserRow({ id: "u1", role: "ADMIN", blockedAt: new Date() }), GUEST_ACTOR);
      assert.deepEqual(actorFromUserRow({ id: "u1", role: "ADMIN", blockedAt: "2026-11-01T00:00:00Z" }), GUEST_ACTOR);
    },
    "a deleted / unknown user (token for a row that no longer exists) is signed out"() {
      assert.deepEqual(actorFromUserRow(null), GUEST_ACTOR);
      assert.deepEqual(actorFromUserRow(undefined), GUEST_ACTOR);
    },
    "an ordinary active user keeps their own id and no admin rights"() {
      assert.deepEqual(actorFromUserRow({ id: "u2", role: "USER", blockedAt: null }), { userId: "u2", isAdmin: false });
    },
    "an unexpected role string is never admin"() {
      assert.equal(actorFromUserRow({ id: "u3", role: "admin", blockedAt: null }).isAdmin, false);
      assert.equal(actorFromUserRow({ id: "u3", role: "", blockedAt: null }).isAdmin, false);
    },
    async "a database failure while loading the user yields a GUEST: an error can only remove access, never grant it"() {
      const errors: unknown[] = [];
      const actor = await resolveActorFromLoader(async () => { throw new Error("connection pool exhausted"); }, (e) => errors.push(e));
      assert.deepEqual(actor, GUEST_ACTOR);
      assert.equal(errors.length, 1);
      assert.deepEqual(await resolveActorFromLoader(async () => { throw new Error("db down"); }), GUEST_ACTOR);
    },
    async "the loader result still goes through the blocked / role rules"() {
      assert.deepEqual(await resolveActorFromLoader(async () => ({ id: "a", role: "ADMIN", blockedAt: null })), { userId: "a", isAdmin: true });
      assert.deepEqual(await resolveActorFromLoader(async () => ({ id: "a", role: "ADMIN", blockedAt: new Date() })), GUEST_ACTOR);
      assert.deepEqual(await resolveActorFromLoader(async () => null), GUEST_ACTOR);
    },
  });
}
