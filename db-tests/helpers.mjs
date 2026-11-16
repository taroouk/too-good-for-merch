import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

// The exact SQL the app runs, taken from the source file so these tests cannot drift from it.
export function rateLimitSql() {
  const src = fs.readFileSync(path.join(root, "src/lib/rate-limit-db.ts"), "utf8");
  const m = src.match(/\$queryRaw<[^>]*>`\s*(INSERT INTO "RateLimitBucket"[\s\S]*?RETURNING "count", "resetAt")\s*`/);
  if (!m) throw new Error("could not find the rate limit statement in src/lib/rate-limit-db.ts");
  let i = 0;
  // ${bucketKey} -> $1, ${freshResetAt} (twice) -> $2, $3
  return m[1].replace(/\$\{[^}]+\}/g, () => `$${++i}`);
}
export async function hit(key, limit, windowMs) {
  const resetAt = new Date(Date.now() + windowMs);
  const rows = await prisma.$queryRawUnsafe(rateLimitSql(), key, resetAt, resetAt);
  return { ok: rows[0].count <= limit, count: rows[0].count };
}
