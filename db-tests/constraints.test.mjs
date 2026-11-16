// REAL PostgreSQL: unique constraints that the register and webhook code rely on. (NOT RUN where no local Postgres exists.)
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./helpers.mjs";

after(() => prisma.$disconnect());

test("20 simultaneous inserts of the same WebhookEvent.eventKey: exactly one wins, the rest are P2002", async () => {
  const eventKey = `dbtest-${Date.now()}`;
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => prisma.webhookEvent.create({ data: { eventKey, eventType: "TRANSACTION", validSignature: true, payload: {} } })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason?.code === "P2002"));
});

test("5 simultaneous registrations of one email: exactly one User row, the others hit P2002 (which the register route treats as 'already exists')", async () => {
  const email = `race-${Date.now()}@dbtest.local`;
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => prisma.user.create({ data: { email, passwordHash: "x", role: "USER" } })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason?.code === "P2002"));
});

test("SELECT ... FOR UPDATE serialises concurrent read-modify-write transactions on one row", async () => {
  const key = `dbtest:lock:${Date.now()}`;
  await prisma.rateLimitBucket.create({ data: { key, count: 0, resetAt: new Date(Date.now() + 60_000) } });
  await Promise.all(Array.from({ length: 25 }, () => prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT key FROM "RateLimitBucket" WHERE key = ${key} FOR UPDATE`;
    const row = await tx.rateLimitBucket.findUniqueOrThrow({ where: { key } });
    await tx.rateLimitBucket.update({ where: { key }, data: { count: row.count + 1 } });
  }, { maxWait: 20_000, timeout: 30_000 })));
  assert.equal((await prisma.rateLimitBucket.findUniqueOrThrow({ where: { key } })).count, 25, "no lost updates");
});
