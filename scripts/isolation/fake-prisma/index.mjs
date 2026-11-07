// Entry point injected as `src/lib/prisma.ts` in the isolated copy (see run-isolated.mjs --fake-prisma).
// The database lives on globalThis.__TGFM_FAKE_DB__ so every module graph (RSC, SSR, route handlers, HMR
// re-evaluations) shares one state. It is seeded once, lazily, and every query waits for the seed to finish.
import { createDb, createFakePrismaClient } from "./engine.mjs";
import { seedDatabase } from "./seed.mjs";

export function getFakeDb() {
  if (!globalThis.__TGFM_FAKE_DB__) {
    const db = createDb();
    globalThis.__TGFM_FAKE_DB__ = db;
    // The seed writes through a view of the same tables that is not gated on `ready` (it IS the ready promise).
    const seedView = { tables: db.tables, txChain: null, ready: Promise.resolve(), counter: 0 };
    db.ready = seedDatabase(createFakePrismaClient(seedView)).catch((error) => {
      console.error("[fake-prisma] seeding failed:", error);
      throw error;
    });
    db.ready.catch(() => {}); // surfaced on every query via `await db.ready`
  }
  return globalThis.__TGFM_FAKE_DB__;
}

export const prisma = createFakePrismaClient(getFakeDb());
export { FakePrismaError } from "./engine.mjs";
