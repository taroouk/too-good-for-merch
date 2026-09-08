type MemoryBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
  resetAt: number;
};

const buckets = new Map<string, MemoryBucket>();
const MAX_BUCKETS = 10_000;

type HeaderMap = Headers | Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderMap | undefined, name: string) {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value ?? null;
}

// P2-6: this app is deployed on Vercel, which terminates the client's TCP
// connection itself and sets `x-forwarded-for` from the real connecting IP
// on every request -- a client cannot override it. `cf-connecting-ip` and
// `x-real-ip` are NOT part of that trusted chain here (this deployment
// isn't fronted by Cloudflare or a custom reverse proxy that sets them);
// trusting them as fallbacks let any caller hand-craft either header to
// pick an arbitrary rate-limit identity, either to dodge their own limit
// or to collide with and lock out a real user/IP. Only the one header this
// platform actually guarantees is trusted; anything else falls back to
// "unknown" (still bounded, just coarser-grained, same as a request with
// no forwarding header at all in local dev).
export function clientIpFromHeaders(headers: HeaderMap | undefined) {
  return headerValue(headers, "x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function pruneExpired(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// P2-6: this in-memory limiter is scoped to a single serverless instance --
// it does NOT bound a caller's total request rate across a Vercel
// deployment's multiple concurrent instances, only their rate against
// whichever one instance happens to handle a given request. Kept
// deliberately for exactly one route: POST /api/pricing/quote (see that
// route for why), which is called very frequently during ordinary
// interactive use (live price updates while configuring a garment), does
// no DB work today, and carries no real abuse cost if under-throttled
// (pure in-memory arithmetic, no external calls, no writes). Everywhere
// else that needs real cross-instance protection should use
// src/lib/rate-limit-db.ts instead, which trades a small DB round trip for
// an actually-shared counter.
export function inMemoryRateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  return inMemoryRateLimitByKey(scope, clientIpFromHeaders(req.headers), limit, windowMs);
}

export function inMemoryRateLimitByKey(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const bucketKey = `${scope}:${key || "unknown"}`;
  const current = buckets.get(bucketKey);
  const bucket =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  buckets.set(bucketKey, bucket);

  const remaining = Math.max(0, limit - bucket.count);
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    ok: bucket.count <= limit,
    limit,
    remaining,
    retryAfter,
    resetAt: bucket.resetAt,
  };
}

// P2-6: shared header formatter, used by both this in-memory limiter and the
// DB-backed one in rate-limit-db.ts -- kept here since it only formats the
// implementation-agnostic RateLimitResult type exported above.
export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfter),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
