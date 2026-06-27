type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 10_000;

type HeaderMap = Headers | Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderMap | undefined, name: string) {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value ?? null;
}

export function clientIpFromHeaders(headers: HeaderMap | undefined) {
  const forwarded = headerValue(headers, "x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwarded ||
    headerValue(headers, "cf-connecting-ip") ||
    headerValue(headers, "x-real-ip") ||
    "unknown"
  );
}

function pruneExpired(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  return rateLimitByKey(scope, clientIpFromHeaders(req.headers), limit, windowMs);
}

export function rateLimitByKey(
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

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfter),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
