-- CreateTable
-- P2-6: backs the distributed (cross-instance) rate limiter in
-- src/lib/rate-limit-db.ts. See the model comment in schema.prisma for why
-- this table exists instead of an external rate-limiting service.
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
