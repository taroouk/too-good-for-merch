import { prisma } from "src/lib/prisma";
import { clientIpFromHeaders, type RateLimitResult } from "src/lib/rate-limit";
import { nextRateLimitState } from "src/lib/rate-limit-core";

// Re-exported for anyone importing the pure logic from this module; the
// canonical implementation now lives in rate-limit-core.ts so it can be unit
// tested without pulling in the Prisma client.
export { nextRateLimitState };

// P2-6: distributed (cross-instance) rate limiter backed by Postgres. Unlike
// the in-memory limiter in src/lib/rate-limit.ts, this one is shared across
// every serverless instance because the counter lives in the RateLimitBucket
// table, not in process memory. Use this for anything where under-throttling
// has a real abuse cost (auth, payment creation, AI generation, webhooks).
//
// Fails OPEN on any DB error (connection pool exhaustion, transient outage,
// etc.) -- i.e. requests are allowed through rather than blocked -- because
// this app has a documented history of connection-pool exhaustion incidents,
// and a rate limiter should never be the reason the whole app goes down.
// Losing the throttle temporarily during a DB blip is an acceptable
// trade-off; hard-failing every request because the limiter itself can't
// reach the DB is not.

// Probability (0..1) that any given call also performs a cleanup sweep of
// long-expired rows, so the table doesn't grow unboundedly without needing a
// dedicated cron job. Deliberately probabilistic (not "always") to avoid
// adding an extra DELETE to every single rate-limited request.
export const RATE_LIMIT_CLEANUP_PROBABILITY = 0.01;

async function maybeCleanup() {
  if (Math.random() >= RATE_LIMIT_CLEANUP_PROBABILITY) return;
  try {
    await prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "resetAt" < NOW() - INTERVAL '1 day'`;
  } catch {
    // best-effort only; never let cleanup failures affect the caller
  }
}

export async function rateLimitByKey(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const bucketKey = `${scope}:${key || "unknown"}`;
  const freshResetAt = new Date(now + windowMs);

  try {
    // Atomic upsert: if the row doesn't exist, or exists but its window has
    // expired, (re)start it at count 1 with a fresh resetAt. Otherwise bump
    // the existing count. This is race-safe under concurrent requests
    // because the INSERT ... ON CONFLICT ... DO UPDATE is a single atomic
    // statement -- no separate read-then-write.
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${bucketKey}, 1, ${freshResetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= NOW() THEN ${freshResetAt}
          ELSE "RateLimitBucket"."resetAt"
        END
      RETURNING "count", "resetAt"
    `;

    void maybeCleanup();

    const row = rows[0];
    const count = row?.count ?? 1;
    const resetAt = row ? new Date(row.resetAt).getTime() : now + windowMs;
    const remaining = Math.max(0, limit - count);
    const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));

    return {
      ok: count <= limit,
      limit,
      remaining,
      retryAfter,
      resetAt,
    };
  } catch (error) {
    console.error(`[rate-limit-db] failing open for ${bucketKey}:`, error);
    return {
      ok: true,
      limit,
      remaining: limit,
      retryAfter: 1,
      resetAt: now + windowMs,
    };
  }
}

export async function rateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  return rateLimitByKey(scope, clientIpFromHeaders(req.headers), limit, windowMs);
}
