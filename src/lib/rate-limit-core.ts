// P2-6: pure, dependency-free core of the DB-backed rate limiter's atomic
// upsert logic, split out from rate-limit-db.ts so it can be unit tested
// without importing the Prisma client (which has side effects and requires
// a real schema/DB connection to even type-check cleanly in isolation).
//
// This mirrors exactly what the SQL's `ON CONFLICT ... DO UPDATE` CASE
// expressions do: if the existing bucket has expired (or doesn't exist),
// start a fresh window with count 1; otherwise increment the existing
// count and keep the existing resetAt.
export function nextRateLimitState(
  current: { count: number; resetAt: number } | null,
  now: number,
  windowMs: number,
): { count: number; resetAt: number } {
  if (!current || current.resetAt <= now) {
    return { count: 1, resetAt: now + windowMs };
  }
  return { count: current.count + 1, resetAt: current.resetAt };
}
