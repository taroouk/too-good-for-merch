#!/usr/bin/env node
// file: scripts/isolation/run-isolated.mjs
//
// Runs a command against a TEMPORARY COPY of the current working tree (including
// uncommitted changes), with no secrets, a scrubbed dummy environment and the
// network guard preloaded into every Node process. Nothing here starts the app by
// itself; you pass the command after `--`.
//
//   node scripts/isolation/run-isolated.mjs [options] -- <command> [args...]
//
//   --root <dir>     source tree (default: this repository)
//   --keep           keep the temporary copy afterwards (printed path)
//   --os-sandbox     also run under macOS sandbox-exec (kernel-level: only loopback network)
//   --dry-run        prepare + verify the copy, print the plan, clean up, run nothing
//   --env KEY=VALUE  extra environment variable (values are scanned for real-looking secrets)
//   --fake-prisma    replace src/lib/prisma.ts in the COPY with the in-memory fake (scripts/isolation/fake-prisma)
//   --qa-routes      install the QA-only test routes (copy only) and set TGFM_FAKE_QA=1
//   --log <file>     where the guard writes violations (default: inside the temp dir)
//
// Guarantees (see scripts/isolation/README.md for the limits):
//   1. No .env*, key, credential, .git, .vercel or storage/ are copied; node_modules is an independent, verified copy.
//   2. The copy is scanned for real-looking secrets; the run aborts if any is found.
//   3. The child gets a from-scratch environment (the parent's environment is NOT inherited).
//   4. Every Node process of the run preloads network-guard.cjs (loopback only, kill on violation).
//   5. The supervisor kills the whole process group as soon as the guard logs a violation.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../..");
export const GUARD_FILE = path.join(HERE, "network-guard.cjs");
export const TEMP_PREFIX = "tgfm-isolated-";
const GRACE_MS = Number(process.env.TGFM_ISOLATION_GRACE_MS) || 3000;
export const VIOLATION_EXIT = 86;

// ---------------------------------------------------------------- what is copied
const EXCLUDED_DIRS = new Set([
  ".git", "node_modules", ".next", ".vercel", ".claude", ".qodo", ".idea", ".vscode",
  "assets-work", "storage", "tmp", "coverage", ".render-test-build", ".payments-test-build", ".turbo",
]);
const EXCLUDED_FILE_PATTERNS = [
  /^\.env($|\.)/i, // .env, .env.local, .env.production, ...
  /^\.npmrc$/i, /^\.netrc$/i, /^\.yarnrc/i,
  /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i, /\.keystore$/i, /^id_(rsa|dsa|ecdsa|ed25519)/i,
  /^credentials/i, /^secrets?\./i, /service-account.*\.json$/i,
  /\.tsbuildinfo$/i, /^\.DS_Store$/,
];
// .env.example is documentation of NAMES only; it is still skipped (nothing env-like is copied).

export function shouldCopy(relativePath, isDirectory) {
  const name = path.basename(relativePath);
  if (isDirectory) return !EXCLUDED_DIRS.has(name);
  return !EXCLUDED_FILE_PATTERNS.some((re) => re.test(name));
}

// ----------------------------------------------------------------- secret scan
const SECRET_PATTERNS = [
  { name: "database URL with credentials to a non-loopback host", re: /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@(?!(?:localhost|127\.\d+\.\d+\.\d+|\[::1\]|guard|host)\b)[\w.-]+/i },
  { name: "Google/Gemini API key", re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "Resend API key", re: /\bre_[A-Za-z0-9]{20,}\b/ },
  { name: "WhatsApp/Meta access token", re: /\bEAA[A-Za-z0-9]{40,}\b/ },
  { name: "Stripe-style live key", re: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "Neon connection host", re: /\bep-[a-z0-9-]+\.[a-z0-9-]+\.aws\.neon\.tech\b/i },
];
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".css", ".html", ".yml", ".yaml", ".toml", ".prisma", ".sql", ".svg", ".env", ".bak", ".cfg", ".ini", ".sh"]);

export function scanForSecrets(dir) {
  const hits = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isSymbolicLink()) continue; // never followed
      if (entry.isDirectory()) { if (entry.name !== "node_modules") walk(full); continue; }
      const ext = path.extname(entry.name).toLowerCase();
      const stat = fs.statSync(full);
      if (stat.size > 2_000_000 || (ext && !TEXT_EXT.has(ext))) continue;
      let text;
      try { text = fs.readFileSync(full, "utf8"); } catch { continue; }
      for (const p of SECRET_PATTERNS) if (p.re.test(text)) hits.push({ file: path.relative(dir, full), pattern: p.name });
    }
  };
  walk(dir);
  return hits;
}

// --------------------------------------------------------------- temporary copy
// Walks a tree and returns a sorted manifest: files with size, symlinks with their literal target.
function manifest(dir) {
  const entries = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      const rel = path.relative(dir, f);
      if (e.isSymbolicLink()) entries.push(`L ${rel} -> ${fs.readlinkSync(f)}`);
      else if (e.isDirectory()) walk(f);
      else entries.push(`F ${rel} ${fs.statSync(f).size}`);
    }
  };
  walk(dir);
  return entries.sort();
}

// Proves the copy is complete, independent and self-contained; throws otherwise.
export function verifyNodeModulesCopy(srcNm, dstNm) {
  const a = manifest(srcNm), b = manifest(dstNm);
  if (a.length !== b.length || a.some((line, i) => line !== b[i])) {
    throw new Error(`node_modules copy differs from the original (${a.length} vs ${b.length} entries)`);
  }
  const dstReal = fs.realpathSync(dstNm);
  let links = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isSymbolicLink()) {
        links++;
        const target = fs.readlinkSync(f);
        if (path.isAbsolute(target)) throw new Error(`absolute symlink in the copy: ${path.relative(dstNm, f)} -> ${target}`);
        let real;
        try { real = fs.realpathSync(f); } catch { continue; } // a dangling link also exists in the original; it leaves nothing behind
        if (real !== dstReal && !real.startsWith(dstReal + path.sep)) throw new Error(`symlink escapes the copy: ${path.relative(dstNm, f)} -> ${real}`);
      } else if (e.isDirectory()) walk(f);
    }
  };
  walk(dstNm);
  // independence: no file of the copy shares an inode with the original (no hardlinks)
  const sample = a.filter((l) => l[0] === "F").filter((_, i) => i % 97 === 0).slice(0, 250).map((l) => l.slice(2).replace(/ \d+$/, ""));
  for (const rel of sample) {
    const s1 = fs.statSync(path.join(srcNm, rel)), s2 = fs.statSync(path.join(dstNm, rel));
    if (s1.ino === s2.ino && s1.dev === s2.dev) throw new Error(`hardlinked file in the copy: ${rel}`);
  }
  return { entries: b.length, files: b.filter((l) => l[0] === "F").length, symlinks: links };
}

export function prepareCopy({ root = REPO_ROOT } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  // Whatever fails while the copy is being made (copy error, node_modules verification, ...), the temporary
  // directory created above must not be left behind: the caller only learns about `tmp` when this returns.
  try {
    return buildCopy({ root, tmp });
  } catch (error) {
    try { removeCopy(tmp); } catch { /* the original error is the one that matters */ }
    throw error;
  }
}

function buildCopy({ root, tmp }) {
  const work = path.join(tmp, "app");
  fs.mkdirSync(work);
  fs.mkdirSync(path.join(tmp, "home"));
  let copied = 0;
  fs.cpSync(root, work, {
    recursive: true,
    dereference: false,
    filter: (src) => {
      if (src === root) return true;
      const rel = path.relative(root, src);
      let isDir = false;
      try { isDir = fs.lstatSync(src).isDirectory(); } catch { return false; }
      const keep = shouldCopy(rel, isDir);
      if (keep && !isDir) copied++;
      return keep;
    },
  });
  // node_modules: an INDEPENDENT copy inside the temporary root (Turbopack refuses files outside its root,
  // so a link to the original does not work). Why a plain copy and not a clone: the repository volume is
  // HFS+ (no clonefile) and the system temp volume is APFS (clones cannot cross volumes); hardlinks are
  // never used (they would let a write in the copy change the original). Symlinks are copied VERBATIM
  // (Node would otherwise rewrite relative targets to absolute paths pointing back at the original).
  const nm = path.join(root, "node_modules");
  let nodeModules = null;
  if (fs.existsSync(nm)) {
    fs.cpSync(nm, path.join(work, "node_modules"), {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      errorOnExist: true,
      force: false,
    });
    nodeModules = verifyNodeModulesCopy(nm, path.join(work, "node_modules"));
  }
  return { tmp, work, copied, nodeModules };
}

export function removeCopy(tmp) {
  // never delete anything that is not one of our own temp directories
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const bases = new Set([os.tmpdir(), "/tmp", "/private/tmp", "/var/tmp"].map(real));
  const base = path.basename(tmp);
  if (!bases.has(real(path.dirname(path.resolve(tmp)))) || !base.startsWith(TEMP_PREFIX)) {
    throw new Error(`refusing to delete ${tmp}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ------------------------------------------------------------------ environment
const DUMMY = "tgfm-test-dummy";
export function buildEnv({ tmp, port = 3100, log, extra = {} }) {
  const env = {
    // minimal OS essentials only -- the parent's environment is NOT inherited
    PATH: process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: path.join(tmp, "home"),
    TMPDIR: path.join(tmp, "home"),
    LANG: "en_US.UTF-8",
    // isolation switches
    TGFM_ISOLATED: "1",
    TGFM_GUARD_LOG: log,
    NODE_OPTIONS: `--require ${JSON.stringify(GUARD_FILE)}`,
    NEXT_TELEMETRY_DISABLED: "1",
    // Next.js 16 `next dev` queries https://registry.npmjs.org/-/npm/v1/security/advisories/bulk at start-up
    // (router-server.js -> assessUpgrade). That check is skipped when ci-info reports CI, so the isolated run
    // declares CI=true: the request is never made (the network guard would otherwise, correctly, kill the run).
    // Set only in this child environment -- nothing global, no project file changes.
    CI: "true",
    // dummy application configuration (none of these is a real credential)
    DATABASE_URL: "postgresql://guard:guard@127.0.0.1:1/guard",
    NEXTAUTH_URL: `http://localhost:${port}`,
    NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
    NEXTAUTH_SECRET: `${DUMMY}-nextauth-secret-not-for-production`,
    ADMIN_EMAILS: "admin@test.invalid",
    // PAYMOB_* is deliberately NOT set either: without credentials the payment code fails before it can call
    // accept.paymob.com (any real call would be an external request and kill the run). Orders still get created.
    // GEMINI_* is deliberately NOT set: with no key the AI mockup route returns its friendly failure message
    // instead of trying to reach Gemini (any such attempt would be an external request and kill the run).
    // RESEND_API_KEY and WHATSAPP_* are deliberately NOT set either: with them the order e-mail / WhatsApp notification code
    // would call api.resend.com / graph.facebook.com (an external request that kills the run). Without them it skips and logs.
    EMAIL_FROM: "TGFM Test <noreply@test.invalid>",
    BESPOKE_NOTIFY_EMAIL: "bespoke@test.invalid",
    STORE_CURRENCY: "EGP",
  };
  for (const [k, v] of Object.entries(extra)) env[k] = v;
  return env;
}

export function checkExtraEnv(extra) {
  for (const [k, v] of Object.entries(extra)) {
    if (/^(DATABASE_URL|DIRECT_URL)$/.test(k) && !/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(v)) {
      throw new Error(`--env ${k} must point at loopback (got a non-loopback database URL)`);
    }
    for (const p of SECRET_PATTERNS) if (p.re.test(String(v))) throw new Error(`--env ${k} looks like a real secret (${p.name})`);
  }
}

// ---------------------------------------------------------------- OS sandbox
export function sandboxProfile() {
  // Verified on macOS: loopback TCP and local unix sockets work, everything else (including raw sockets that
  // bypass JavaScript) gets EPERM from the kernel. Note: a broad `(local ip "localhost:*")` rule on
  // network* would also match outbound connects, so the allowances are split by direction.
  return [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    '(allow network-outbound (remote ip "localhost:*"))',
    '(allow network-bind (local ip "localhost:*"))',
    '(allow network-inbound (local ip "localhost:*"))',
    "(allow network-outbound (remote unix-socket))",
    "(allow network-bind (local unix-socket))",
    "(allow network-inbound (local unix-socket))",
  ].join("\n") + "\n";
}
export function sandboxAvailable() {
  return process.platform === "darwin" && fs.existsSync("/usr/bin/sandbox-exec");
}

// ------------------------------------------------------------ fake Prisma injection
// Replaces src/lib/prisma.ts INSIDE THE TEMPORARY COPY ONLY with a module that exports the in-memory fake
// (scripts/isolation/fake-prisma). The original working tree is never written. The scan afterwards refuses to run
// when the real file survived or when anything on the run path can still create a real Prisma client.
export const FAKE_PRISMA_MARKER = "TGFM_FAKE_PRISMA_INJECTED";
export const FAKE_PRISMA_STUB = `// ${FAKE_PRISMA_MARKER} -- generated into the ISOLATED COPY only by scripts/isolation/run-isolated.mjs --fake-prisma.
// @ts-nocheck
export { prisma } from "../../scripts/isolation/fake-prisma/index.mjs";
`;
const FAKE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-prisma");

export function injectFakePrisma(work) {
  const target = path.join(work, "src", "lib", "prisma.ts");
  if (!fs.existsSync(target)) throw new Error("--fake-prisma: src/lib/prisma.ts not found in the copy; refusing to continue");
  // The fake always comes from the runner's own checkout (trusted), never from whatever --root points at.
  const dest = path.join(work, "scripts", "isolation", "fake-prisma");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(FAKE_DIR, dest, { recursive: true });
  fs.writeFileSync(target, FAKE_PRISMA_STUB);
  return { target, dest };
}

const RUN_PATH_DIRS = ["src", "app", path.join("scripts", "isolation", "fake-prisma")];
const RUN_PATH_FILES = ["proxy.ts", "middleware.ts", "instrumentation.ts", "next.config.ts", "next.config.js", "next.config.mjs"];
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const REAL_PRISMA_PATTERNS = [
  { name: "new PrismaClient(...)", re: /\bnew\s+PrismaClient\b/ },
  { name: "value import of PrismaClient from @prisma/client", re: /import\s+(?!type\b)\{[^}]*\bPrismaClient\b[^}]*\}\s*from\s*["']@prisma\/client[^"']*["']/ },
  { name: "require(@prisma/client).PrismaClient", re: /require\(\s*["']@prisma\/client[^"']*["']\s*\)[^;\n]*\bPrismaClient\b/ },
  { name: "@prisma/client/runtime or /edge import", re: /from\s*["']@prisma\/client\/(?:runtime|edge|wasm)/ },
];

// Returns a list of problems (empty = safe to run).
export function assertNoRealPrisma(work) {
  const problems = [];
  const target = path.join(work, "src", "lib", "prisma.ts");
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  if (current === null) problems.push("src/lib/prisma.ts is missing");
  else if (current !== FAKE_PRISMA_STUB) problems.push("src/lib/prisma.ts is not the injected fake (the real Prisma client file would be used)");
  if (!fs.existsSync(path.join(work, "scripts", "isolation", "fake-prisma", "index.mjs"))) problems.push("the fake-prisma module is missing from the copy");
  let scanned = 0;
  const scan = (file) => {
    scanned++;
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(work, file);
    for (const p of REAL_PRISMA_PATTERNS) if (p.re.test(text)) problems.push(`${rel}: ${p.name}`);
    if (rel.startsWith(RUN_PATH_DIRS[2]) && /@prisma\/client/.test(text)) problems.push(`${rel}: the fake must not import @prisma/client`);
  };
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink() || e.name === "node_modules" || e.name === "__tests__" || e.name === ".next") continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (CODE_FILE.test(e.name)) scan(f);
    }
  };
  for (const d of RUN_PATH_DIRS) walk(path.join(work, d));
  for (const f of RUN_PATH_FILES) if (fs.existsSync(path.join(work, f))) scan(path.join(work, f));
  return { problems, scanned };
}

// ------------------------------------------------------------------------ main
function parseArgs(argv) {
  const opts = { root: REPO_ROOT, keep: false, osSandbox: false, dryRun: false, fakePrisma: false, qaRoutes: false, port: 3100, extra: {}, log: undefined, command: [] };
  const i = argv.indexOf("--");
  const own = i === -1 ? argv : argv.slice(0, i);
  opts.command = i === -1 ? [] : argv.slice(i + 1);
  for (let k = 0; k < own.length; k++) {
    const a = own[k];
    if (a === "--keep") opts.keep = true;
    else if (a === "--os-sandbox") opts.osSandbox = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--fake-prisma") opts.fakePrisma = true;
    else if (a === "--qa-routes") opts.qaRoutes = true;
    else if (a === "--root") opts.root = path.resolve(own[++k]);
    else if (a === "--port") opts.port = Number(own[++k]);
    else if (a === "--log") opts.log = path.resolve(own[++k]);
    else if (a === "--env") { const [key, ...rest] = String(own[++k]).split("="); opts.extra[key] = rest.join("="); }
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  checkExtraEnv(opts.extra);
  if (!opts.dryRun && opts.command.length === 0) throw new Error("no command given (use: -- <command> [args])");
  if (opts.osSandbox && !sandboxAvailable()) throw new Error("--os-sandbox requested but sandbox-exec is not available on this machine");

  const { tmp, work, copied, nodeModules } = prepareCopy({ root: opts.root });
  const log = opts.log || path.join(tmp, "guard.log");
  let exitCode = 0;
  try {
    let fakeInfo = null;
    if (opts.fakePrisma) {
      injectFakePrisma(work);
      const check = assertNoRealPrisma(work);
      if (check.problems.length) {
        console.error("[isolated] ABORT: the real Prisma client could still be used:");
        for (const p of check.problems) console.error(`  - ${p}`);
        return 2;
      }
      fakeInfo = check;
    }
    if (opts.qaRoutes) {
      // QA-only routes exist in the COPY only (see scripts/isolation/qa/overlay).
      fs.cpSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "qa", "overlay"), work, { recursive: true });
      opts.extra.TGFM_FAKE_QA = "1";
      // A throwaway LOCAL secret so signed webhook payloads can be produced by the QA scripts. It is not a Paymob key and
      // nothing here can reach Paymob; PAYMOB_API_KEY and the other credentials stay unset.
      opts.extra.PAYMOB_HMAC_SECRET = "qa-local-hmac-secret-not-a-real-key";
    }
    const hits = scanForSecrets(work);
    if (hits.length) {
      console.error("[isolated] ABORT: the temporary copy contains real-looking secrets:");
      for (const h of hits) console.error(`  - ${h.file}: ${h.pattern}`);
      return 2;
    }
    const leftovers = [];
    const find = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isSymbolicLink() || e.name === "node_modules") continue; const f = path.join(d, e.name); if (e.isDirectory()) find(f); else if (EXCLUDED_FILE_PATTERNS.some((re) => re.test(e.name)) && !/tsbuildinfo|DS_Store/.test(e.name)) leftovers.push(path.relative(work, f)); } };
    find(work);
    if (leftovers.length) { console.error("[isolated] ABORT: forbidden files in the copy:", leftovers); return 2; }

    const env = buildEnv({ tmp, port: opts.port, log, extra: opts.extra });
    console.error(`[isolated] copy: ${work}  (${copied} files, no .env*; node_modules: ${nodeModules ? `independent copy, ${nodeModules.files} files + ${nodeModules.symlinks} symlinks, all inside the copy` : "none"})`);
    console.error(`[isolated] env: from scratch (${Object.keys(env).length} keys), DATABASE_URL=${env.DATABASE_URL}`);
    if (fakeInfo) console.error(`[isolated] fake-prisma: src/lib/prisma.ts replaced in the copy; ${fakeInfo.scanned} run-path files scanned, no real Prisma client creation found`);
    console.error(`[isolated] guard: ${GUARD_FILE}  log: ${log}${opts.osSandbox ? "  + macOS sandbox-exec" : ""}`);
    if (opts.dryRun) return 0;

    let [cmd, ...args] = opts.command;
    if (cmd === "node") cmd = process.execPath;
    let finalCmd = cmd, finalArgs = args;
    if (opts.osSandbox) {
      const profile = path.join(tmp, "network.sb");
      fs.writeFileSync(profile, sandboxProfile());
      finalCmd = "/usr/bin/sandbox-exec";
      finalArgs = ["-f", profile, cmd, ...args];
    }
    // The child leads its OWN process group (detached), so `-child.pid` addresses exactly the command and
    // everything it spawned (Next server, Turbopack workers) and nothing else. Never pkill / name matching.
    const child = spawn(finalCmd, finalArgs, { cwd: work, env, stdio: "inherit", detached: true });
    const groupAlive = () => { try { process.kill(-child.pid, 0); return true; } catch { return false; } };
    const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch {} };
    let killedForViolation = false;
    const watcher = setInterval(() => {
      if (!killedForViolation && fs.existsSync(log) && fs.statSync(log).size > 0) {
        killedForViolation = true;
        console.error("\n[isolated] NETWORK GUARD VIOLATION -- killing the whole process group:\n" + fs.readFileSync(log, "utf8"));
        killGroup("SIGKILL");
      }
    }, 150);
    // Signals sent to the runner: stop the whole group (TERM, then KILL after a grace period), wait, then
    // fall through to the normal cleanup below (temp copy removal) instead of dying with the copy behind.
    let signalled = null;
    const onSignal = (sig) => {
      if (signalled) return;
      signalled = sig;
      console.error(`\n[isolated] ${sig} received -- stopping the process group`);
      killGroup("SIGTERM");
      setTimeout(() => killGroup("SIGKILL"), GRACE_MS).unref();
    };
    const signals = ["SIGTERM", "SIGINT", "SIGHUP"];
    for (const sg of signals) process.on(sg, onSignal);
    try {
      exitCode = await new Promise((resolve) => child.on("exit", (code, sig) => resolve(code ?? (sig ? 128 : 0))));
    } finally {
      clearInterval(watcher);
      for (const sg of signals) process.off(sg, onSignal);
      // The main command may have exited while descendants are still alive: finish the whole group.
      if (groupAlive()) {
        killGroup("SIGTERM");
        const t0 = Date.now();
        while (groupAlive() && Date.now() - t0 < GRACE_MS) await new Promise((r) => setTimeout(r, 50));
        if (groupAlive()) { killGroup("SIGKILL"); await new Promise((r) => setTimeout(r, 100)); }
      }
    }
    if (signalled) exitCode = 128 + ({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 })[signalled];
    if (fs.existsSync(log) && fs.statSync(log).size > 0) exitCode = VIOLATION_EXIT;
    return exitCode;
  } finally {
    if (opts.keep) console.error(`[isolated] kept: ${tmp}`);
    else removeCopy(tmp);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(`[isolated] ${err.message}`); process.exit(2); });
}
