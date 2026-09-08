// file: src/lib/__tests__/rate-limit-core.test.ts
import assert from "node:assert/strict";
import { nextRateLimitState } from "../rate-limit-core";
import { runSuite } from "../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/rate-limit-core", {
    "a fresh key (no existing bucket) starts a window at count 1"() {
      const now = 1_000_000;
      const windowMs = 60_000;
      const next = nextRateLimitState(null, now, windowMs);
      assert.equal(next.count, 1);
      assert.equal(next.resetAt, now + windowMs);
    },

    "a request within an active window increments the count and keeps resetAt"() {
      const now = 1_000_000;
      const windowMs = 60_000;
      const current = { count: 3, resetAt: now + 30_000 };
      const next = nextRateLimitState(current, now, windowMs);
      assert.equal(next.count, 4);
      assert.equal(next.resetAt, current.resetAt);
    },

    "a request after the window has expired restarts at count 1 with a fresh resetAt"() {
      const now = 1_000_000;
      const windowMs = 60_000;
      const current = { count: 9, resetAt: now - 1 };
      const next = nextRateLimitState(current, now, windowMs);
      assert.equal(next.count, 1);
      assert.equal(next.resetAt, now + windowMs);
    },

    "a request exactly at the resetAt boundary is treated as expired (resetAt <= now)"() {
      const now = 1_000_000;
      const windowMs = 60_000;
      const current = { count: 5, resetAt: now };
      const next = nextRateLimitState(current, now, windowMs);
      assert.equal(next.count, 1);
      assert.equal(next.resetAt, now + windowMs);
    },

    "repeated calls within the same window accumulate the count sequentially"() {
      const now = 1_000_000;
      const windowMs = 60_000;
      let state: { count: number; resetAt: number } | null = null;
      for (let i = 0; i < 5; i++) {
        state = nextRateLimitState(state, now + i, windowMs);
      }
      assert.equal(state!.count, 5);
      assert.equal(state!.resetAt, now + windowMs);
    },
  });
}
