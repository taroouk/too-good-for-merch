// file: src/lib/mockups/__tests__/ai-policy.test.ts
//
// M8 regression: /api/mockups/nanobanana (paid Gemini calls) accepted anonymous visitors, limited only by a shared "anon" bucket
// per IP. It now requires a signed-in active user and has per-user and store-wide daily caps.
import assert from "node:assert/strict";
import {
  AI_MOCKUP_SIGN_IN_MESSAGE,
  DEFAULT_AI_MOCKUPS_GLOBAL_PER_DAY,
  DEFAULT_AI_MOCKUPS_PER_USER_PER_DAY,
  aiMockupSignInGate,
  parseAiMockupCaps,
} from "../ai-policy";
import { GUEST_ACTOR, actorFromUserRow } from "../actor-logic";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/mockups/ai-policy", {
    "a guest is refused with 401 and asked to sign in"() {
      const gate = aiMockupSignInGate(GUEST_ACTOR);
      assert.equal(gate.ok, false);
      if (gate.ok) throw new Error("unreachable");
      assert.equal(gate.status, 401);
      assert.equal(gate.message, AI_MOCKUP_SIGN_IN_MESSAGE);
      assert.match(gate.message, /sign in/i);
      assert.doesNotMatch(gate.message, /print/i);
    },
    "a signed-in active user and an active admin pass the gate"() {
      assert.deepEqual(aiMockupSignInGate(actorFromUserRow({ id: "u1", role: "USER", blockedAt: null })), { ok: true });
      assert.deepEqual(aiMockupSignInGate(actorFromUserRow({ id: "a1", role: "ADMIN", blockedAt: null })), { ok: true });
    },
    "a BLOCKED user does not pass the gate (they are a guest to the policy)"() {
      assert.equal(aiMockupSignInGate(actorFromUserRow({ id: "u1", role: "USER", blockedAt: new Date() })).ok, false);
    },
    "caps default to 40 per user and 1000 store-wide per day"() {
      assert.deepEqual(parseAiMockupCaps({}), { perUserPerDay: DEFAULT_AI_MOCKUPS_PER_USER_PER_DAY, globalPerDay: DEFAULT_AI_MOCKUPS_GLOBAL_PER_DAY });
      assert.equal(DEFAULT_AI_MOCKUPS_PER_USER_PER_DAY, 40);
      assert.equal(DEFAULT_AI_MOCKUPS_GLOBAL_PER_DAY, 1000);
    },
    "caps can be configured through the environment"() {
      assert.deepEqual(parseAiMockupCaps({ AI_MOCKUP_DAILY_LIMIT_PER_USER: "10", AI_MOCKUP_DAILY_LIMIT_GLOBAL: "250" }), { perUserPerDay: 10, globalPerDay: 250 });
    },
    "a typo can never switch the cap off: zero, negative, fractional, non-numeric and blank values fall back to the default"() {
      for (const bad of ["0", "-5", "1.5", "abc", "", "  ", "Infinity", "NaN"]) {
        const caps = parseAiMockupCaps({ AI_MOCKUP_DAILY_LIMIT_PER_USER: bad, AI_MOCKUP_DAILY_LIMIT_GLOBAL: bad });
        assert.equal(caps.perUserPerDay, DEFAULT_AI_MOCKUPS_PER_USER_PER_DAY, `per-user for ${JSON.stringify(bad)}`);
        assert.equal(caps.globalPerDay, DEFAULT_AI_MOCKUPS_GLOBAL_PER_DAY, `global for ${JSON.stringify(bad)}`);
      }
    },
    "an absurdly large value is clamped"() {
      assert.equal(parseAiMockupCaps({ AI_MOCKUP_DAILY_LIMIT_GLOBAL: "999999999" }).globalPerDay, 100_000);
    },
  });
}
