# Isolated local test runs (phase 1: security isolation only)

Nothing here starts or changes the TGFM app. It provides:

- `network-guard.cjs` — preloaded into every Node process; loopback only; any other destination is logged and the process is killed (exit 86).
- `run-isolated.mjs` — runs a command against a temporary copy of the working tree (uncommitted changes included) with no `.env*`/keys/`.git`/`storage`, a secret scan of the copy, a from-scratch dummy environment, the guard preloaded, a supervisor that kills the process group on a violation, and optional kernel-level `--os-sandbox` (macOS `sandbox-exec`).
- `__tests__/` — standalone tests: `node --test scripts/isolation/__tests__/*.test.mjs` (Node's built-in runner, nothing to install). Probes use only `.invalid` names and TEST-NET-1 (192.0.2.1), which can never reach a real service.

Later phases: `node scripts/isolation/run-isolated.mjs --os-sandbox -- node node_modules/next/dist/bin/next dev -p 3100`

## What the guard covers
net.Socket#connect / net.connect / createConnection, tls.connect, http/https request+get, http2.connect, global fetch (undici), WebSocket / EventSource, dns lookup/resolve*/reverse/Resolver and dns.promises, dgram connect/send, child_process (spawn, spawnSync, exec, execSync, execFile, execFileSync, fork: only `node` may start, shells with chained commands are refused, every child gets the guard injected into its env), and worker threads.

## Limits
- Internal bindings (e.g. `process.binding('tcp_wrap')`) and native addons that open sockets in C/C++ bypass the JS guard; only the kernel layer (`--os-sandbox`) stops them.
- Processes not started through the runner do not have the guard (it is opt-in through NODE_OPTIONS).
- The guard is JavaScript in the same process: a safety net against accidents, not against hostile code.
- Browser traffic (Chromium) is not a Node process; it must be restricted separately (route interception + `--host-resolver-rules`) in the Playwright phase.
- No kernel layer on non-macOS systems here (use a firewall / network namespace).
- Unix-domain sockets are allowed (Node/Next IPC). Non-`node` executables are refused, which may need an allow-list entry if Next.js legitimately spawns another tool.

## node_modules in the temporary copy

The copy gets its own **independent** `node_modules` (Turbopack refuses files outside its root, so a link to the original does not work). The repo volume is HFS+ (no clonefile) and clones cannot cross volumes anyway, so it is a plain byte copy (`fs.cpSync`, symlinks copied verbatim). Hardlinks are never used. After copying, `verifyNodeModulesCopy` checks: identical manifest (paths, sizes, symlink targets), no absolute symlinks, no symlink resolving outside the copy, and no shared inodes with the original. Removing the copy leaves the original untouched (tested).

## The one local stub (npm dist-tags)

Next's dev HMR handshake calls `fetch("https://registry.npmjs.org/-/package/next/dist-tags")`. `network-guard.cjs` answers exactly that request (string or `URL`, GET, no other options) from memory with a **synthetic** body (`{"latest":"16.4.5","canary":"16.4.5","_synthetic":"tgfm-isolation-local-stub"}`, header `x-tgfm-synthetic: 1`) and never reaches DNS, sockets or the real fetch. Each use is appended to `<TGFM_GUARD_LOG>.stub-uses`. Any other URL, scheme, path, query, method, option, `Request` object or `http(s).get` to that host stays blocked and kills the process group (`__tests__/stub.test.mjs`, run under a deny-all `sandbox-exec`).

## Fake Prisma (`--fake-prisma`)

`--fake-prisma` replaces `src/lib/prisma.ts` **in the temporary copy only** with a one-line module that exports the in-memory fake from `scripts/isolation/fake-prisma/` (the original file is never written). Before anything starts, `assertNoRealPrisma` refuses to run (exit 2) when: the copy's `prisma.ts` is not exactly the injected stub; the fake module is missing; or any run-path file (`src/`, `app/`, `proxy.ts`, `instrumentation.ts`, `next.config.*`, the fake dir) creates a real client (`new PrismaClient`, a non-type import of it, `require(...).PrismaClient`, `@prisma/client/runtime|edge|wasm`). The fake directory itself must not mention `@prisma/client` at all.

The engine (`engine.mjs`, schema in `models.mjs`, fixed data in `seed.mjs`, shared state on `globalThis.__TGFM_FAKE_DB__` in `index.mjs`) implements only what the Studio/Builder path uses: `findUnique/OrThrow`, `findFirst/OrThrow`, `findMany`, `count`, `create` (nested `create`/`connect`), `update`, `updateMany`, `upsert`, `delete`, `deleteMany`; `where` with `AND/OR/NOT`, `in/notIn/not/lt/lte/gt/gte/contains/startsWith/endsWith`, to-one (`is/isNot` and shorthand) and to-many (`some/every/none`) relation filters, compound uniques; `select`/`include` (nested, with `where/orderBy/take/skip` on to-many), `_count`, `orderBy`, `take`, `skip`; interactive `$transaction` with rollback; `$queryRaw`/`$executeRaw` only for the exact RateLimitBucket statements (a test compares them with `src/lib/rate-limit-db.ts`). `Prisma.DbNull/JsonNull/AnyNull` are recognised by class name (the runtime is never imported).

**Not supported (always throws `FakePrismaError`, code `FAKE_UNSUPPORTED`, never an empty result):** every model outside `models.mjs` (Order, Account, Session, Bespoke*, AdminAuditLog, LegalPage, PaymentAttempt, ...), `groupBy`, `aggregate`, `createMany`, `distinct`, `cursor`, `$transaction([...])`, nested `$transaction`, nested writes inside `update`, `connectOrCreate`, update operators other than `set` (`increment`, ...), JSON path filters, `mode: "insensitive"`, relation `orderBy`, any other raw SQL, `$queryRawUnsafe`, `$executeRawUnsafe`, `$on`, `$use`, `$extends`. Arguments are validated before any row is read, so an unsupported filter fails the same way on an empty table.
