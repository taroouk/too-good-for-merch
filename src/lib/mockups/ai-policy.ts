// file: src/lib/mockups/ai-policy.ts
//
// M8: policy for the paid Gemini mockup route (/api/mockups/nanobanana). Every call costs money, so it is for signed-in
// customers only (guests get a 401; there is no other way to make a mockup and no fallback), and it has a per-user and a
// store-wide daily cap on top of the short burst limit. Pure and Prisma-free so it can be unit tested.
import type { MockupActor } from "./actor-logic";

export const AI_MOCKUP_DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_AI_MOCKUPS_PER_USER_PER_DAY = 40;
export const DEFAULT_AI_MOCKUPS_GLOBAL_PER_DAY = 1000;
const MAX_CONFIGURABLE = 100_000;

export const AI_MOCKUP_SIGN_IN_MESSAGE = "Sign in to generate your preview.";
export const AI_MOCKUP_USER_LIMIT_MESSAGE = "You've reached today's limit for previews. Please try again tomorrow.";
export const AI_MOCKUP_GLOBAL_LIMIT_MESSAGE = "Previews are temporarily unavailable. Please try again later.";

function positiveInt(raw: string | undefined, fallback: number) {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, MAX_CONFIGURABLE);
}

// AI_MOCKUP_DAILY_LIMIT_PER_USER / AI_MOCKUP_DAILY_LIMIT_GLOBAL. A missing, zero, negative, fractional or non-numeric value
// falls back to the default (a typo must never turn the cap off).
export function parseAiMockupCaps(env: Record<string, string | undefined>) {
  return {
    perUserPerDay: positiveInt(env.AI_MOCKUP_DAILY_LIMIT_PER_USER, DEFAULT_AI_MOCKUPS_PER_USER_PER_DAY),
    globalPerDay: positiveInt(env.AI_MOCKUP_DAILY_LIMIT_GLOBAL, DEFAULT_AI_MOCKUPS_GLOBAL_PER_DAY),
  };
}

// Only an active, signed-in user (per the database: see actor-logic) may spend Gemini credit.
export function aiMockupSignInGate(actor: MockupActor): { ok: true } | { ok: false; status: 401; message: string } {
  if (actor.userId) return { ok: true };
  return { ok: false, status: 401, message: AI_MOCKUP_SIGN_IN_MESSAGE };
}
