// REAL PostgreSQL: is the rate limiter atomic under concurrent requests? (NOT RUN where no local Postgres exists.)
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { hit, prisma } from "./helpers.mjs";

after(() => prisma.$disconnect());

test("200 simultaneous requests against a limit of 40: exactly 40 are allowed, none overshoot", async () => {
  const key = `dbtest:burst:${Date.now()}`;
  const results = await Promise.all(Array.from({ length: 200 }, () => hit(key, 40, 60_000)));
  assert.equal(results.filter((r) => r.ok).length, 40);
  assert.equal(Math.max(...results.map((r) => r.count)), 200, "every request was counted exactly once");
  assert.equal(new Set(results.map((r) => r.count)).size, 200, "no two requests saw the same count");
});

test("the window is a FIXED window from the first request (not a calendar day): it restarts only after resetAt passes", async () => {
  const key = `dbtest:window:${Date.now()}`;
  for (let i = 0; i < 3; i++) await hit(key, 2, 1_000);
  assert.equal((await hit(key, 2, 1_000)).ok, false);
  await new Promise((r) => setTimeout(r, 1_300));
  assert.equal((await hit(key, 2, 1_000)).count, 1, "a new window starts at count 1");
});
