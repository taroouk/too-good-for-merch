import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const isNewClient = !globalForPrisma.prisma;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Reads only. A write (create/update/delete/upsert/...Many) that throws a
// connection error may already have committed server-side before the
// response made it back, so retrying it blindly risks a duplicate; a read
// has no such risk.
const RETRYABLE_READ_ACTIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

// P1001 ("can't reach database server") and P1017 ("server has closed the
// connection") mean the connection itself failed, not that the query ran
// and produced this outcome -- observed in practice from Neon's PgBouncer
// pooler recycling idle connections out from under this long-lived
// singleton. P2024 (connection pool timeout) is deliberately excluded:
// retrying immediately would add more load to an already-saturated pool.
// Checked via error.code directly, not `instanceof Prisma.
// PrismaClientKnownRequestError` -- this file imports only the plain
// PrismaClient class, never the `Prisma` namespace/runtime.
const RETRYABLE_CONNECTION_ERROR_CODES = new Set(["P1001", "P1017"]);
const RETRY_DELAY_MS = 200;

// PrismaClientInitializationError (thrown when the engine can't establish
// its *first* connection, e.g. `prisma.user.findUnique(...)` as the very
// first query against a Neon compute that auto-suspended from inactivity
// and needs a few seconds to wake) is a *different* error class from
// PrismaClientKnownRequestError above -- confirmed by reading
// node_modules/@prisma/client/runtime/library.js: it carries `.errorCode`,
// not `.code`, so the P1001/P1017 check above never matches it and this
// class of failure was silently going unretried. Verified empirically
// (scripts/_tmp_middleware_probe.mjs, removed) that $use's `next(params)`
// promise does reject with this error class, so it's catchable here.
// Neon's wake-from-suspend latency runs a few seconds, not milliseconds,
// so this gets its own slower backoff rather than reusing RETRY_DELAY_MS.
const INIT_RETRY_DELAYS_MS = [500, 1500, 3000];

function isPrismaInitializationError(error: unknown): boolean {
  return Boolean(error) && (error as { name?: string }).name === "PrismaClientInitializationError";
}

// `@prisma/client` resolves to a browser-safe stub when this file ends up
// in a client bundle (it does -- src/db/mockup.ts imports `prisma` here
// and is itself imported by the "use client" BuilderClient.tsx for
// computeMockupFingerprint, a function that never touches `prisma`).
// That stub's PrismaClient constructor returns a Proxy that only throws
// ("PrismaClient is unable to run in this browser environment...") the
// moment ANY property is read off it -- confirmed by reading
// node_modules/.prisma/client/index-browser.js directly. The plain
// singleton above never reads a property off `prisma`, so it's silently
// inert in the browser; `prisma.$use(...)` IS a property read, and doing
// it unconditionally at module scope is what broke the client bundle
// before. Gating it behind this check ensures that read never happens
// outside Node (no `window` global), while still registering normally on
// the server.
if (typeof window === "undefined") {
  // Registered only when a NEW client is constructed (guarded by the same
  // globalForPrisma cache the singleton itself uses), not on every module
  // re-evaluation -- otherwise Turbopack/Next.js hot-reload would stack a
  // fresh middleware onto the same long-lived client on every edit.
  if (isNewClient) {
    prisma.$use(async (params, next) => {
      if (!RETRYABLE_READ_ACTIONS.has(params.action)) {
        return next(params);
      }

      for (let attempt = 0; attempt <= INIT_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          return await next(params);
        } catch (error) {
          if (isPrismaInitializationError(error)) {
            if (attempt >= INIT_RETRY_DELAYS_MS.length) throw error;
            const delay = INIT_RETRY_DELAYS_MS[attempt];
            console.warn(
              `prisma: initialization error on ${params.model ?? "?"}.${params.action} (likely Neon compute waking from suspend) -- retrying in ${delay}ms (attempt ${attempt + 1}/${INIT_RETRY_DELAYS_MS.length})`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          const code = (error as { code?: string } | null)?.code;
          if (!code || !RETRYABLE_CONNECTION_ERROR_CODES.has(code)) {
            throw error;
          }

          console.warn(
            `prisma: transient connection error ${code} on ${params.model ?? "?"}.${params.action} -- retrying once`,
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return next(params);
        }
      }
      // Unreachable: the loop above always returns or throws.
      throw new Error("prisma: retry loop exited without a result");
    });
  }
}
