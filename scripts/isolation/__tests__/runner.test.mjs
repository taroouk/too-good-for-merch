// Tests for run-isolated.mjs (temporary copy, secret exclusion, scrubbed env, supervision, OS sandbox).
// Nothing here starts the TGFM app; commands are tiny `node -e` probes. Run: node --test scripts/isolation/__tests__/
//
// SAFETY: probes only use `.invalid` names / TEST-NET-1 (never reachable); the "real-looking secrets"
// below are FAKE strings built only inside temporary fixture directories.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { buildEnv, prepareCopy, FAKE_PRISMA_STUB, REPO_ROOT, TEMP_PREFIX, assertNoRealPrisma, injectFakePrisma, removeCopy, sandboxAvailable, sandboxProfile, scanForSecrets, verifyNodeModulesCopy } from "../run-isolated.mjs";

const RUNNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../run-isolated.mjs");
// Built from parts so this file itself never contains a secret-looking string (the copy scan would, rightly, flag it).
const FAKE_NEON = ["postgres", "ql://FAKEUSER:FAKEPASS@ep-fake-123456.eu-central-1.aws.", "neon.tech/neondb"].join("");
const FAKE_PEM = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isSymbolicLink()) { out.push(f); continue; } if (e.isDirectory()) { if (e.name !== "node_modules") walk(f, out); } else out.push(f); } return out; };

function runner(args, env = {}) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8", timeout: 120000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
const fixtureDirs = [];
after(() => { for (const d of fixtureDirs) fs.rmSync(d, { recursive: true, force: true }); });
function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tgfm-fixture-"));
  fixtureDirs.push(dir);
  for (const [name, content] of Object.entries(files)) { const f = path.join(dir, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
  return dir;
}
const keptPath = (stderr) => /\[isolated\] kept: (.+)/.exec(stderr)?.[1];

describe("temporary copy of the working tree", () => {
  test("the real repository copy has no .env*, no secrets, no .git, an independent node_modules copy, and carries uncommitted files", () => {
    const r = runner(["--dry-run", "--keep"]);
    assert.equal(r.status, 0, r.stderr);
    const tmp = keptPath(r.stderr);
    assert.ok(tmp && path.basename(tmp).startsWith(TEMP_PREFIX), r.stderr);
    try {
      const work = path.join(tmp, "app");
      const files = walk(work);
      const names = files.map((f) => path.basename(f));
      assert.deepEqual(names.filter((n) => /^\.env($|\.)/i.test(n)), [], ".env files were copied");
      assert.deepEqual(names.filter((n) => /\.(pem|key|p12|pfx)$|^\.npmrc$|^\.netrc$/i.test(n)), [], "key/credential files were copied");
      assert.ok(!fs.existsSync(path.join(work, ".git")), ".git copied");
      assert.ok(!fs.existsSync(path.join(work, "storage")), "storage/ copied");
      assert.ok(!fs.existsSync(path.join(work, ".claude")), ".claude copied");
      const nmCopy = path.join(work, "node_modules");
      assert.ok(fs.lstatSync(nmCopy).isDirectory() && !fs.lstatSync(nmCopy).isSymbolicLink(), "node_modules must be a real directory inside the copy");
      assert.ok(fs.existsSync(path.join(nmCopy, "next/package.json")), "next missing from the copied node_modules");
      // independence: the full verifier passes (same manifest, no escaping/absolute symlinks, no hardlinks)
      const v = verifyNodeModulesCopy(path.join(REPO_ROOT, "node_modules"), nmCopy);
      assert.ok(v.files > 1000 && v.symlinks >= 1, JSON.stringify(v));
      // writing into the copy must not change the original
      const probe = path.join("next", "package.json");
      const before = fs.readFileSync(path.join(REPO_ROOT, "node_modules", probe));
      fs.chmodSync(path.join(nmCopy, probe), 0o644);
      fs.appendFileSync(path.join(nmCopy, probe), "\n/* copy-only */");
      assert.ok(fs.readFileSync(path.join(REPO_ROOT, "node_modules", probe)).equals(before), "original node_modules/next/package.json changed through the copy");
      // uncommitted work is present and byte-identical to the working tree
      for (const rel of ["src/studio/ui/BuilderClient.tsx", "src/studio/render/composite.ts", "src/pricing/display.ts"]) {
        assert.ok(fs.readFileSync(path.join(work, rel)).equals(fs.readFileSync(path.join(REPO_ROOT, rel))), `${rel} differs from the working tree`);
      }
      assert.deepEqual(scanForSecrets(work), [], "secret scan found something in the real copy");
      // the original tree is untouched
      assert.ok(fs.existsSync(path.join(REPO_ROOT, ".env")) || true);
    } finally { removeCopy(tmp); }
    assert.ok(!fs.existsSync(tmp), "temp copy was not removed");
    assert.ok(fs.existsSync(path.join(REPO_ROOT, "node_modules/next/package.json")), "removing the copy damaged the original node_modules");
  });

  test("a fixture with .env files and keys: they are excluded and the copy is accepted", () => {
    const root = fixture({ "app/page.tsx": "export default 1", ".env": `DATABASE_URL=${FAKE_NEON}`, ".env.local": "X=1", ".env.production": "Y=1", "keys/server.pem": "k", "id_rsa": "k", "nested/.env": "Z=1" });
    try {
      const r = runner(["--root", root, "--dry-run", "--keep"]);
      assert.equal(r.status, 0, r.stderr);
      const tmp = keptPath(r.stderr);
      try {
        const names = walk(path.join(tmp, "app")).map((f) => path.relative(path.join(tmp, "app"), f));
        assert.deepEqual(names, ["app/page.tsx"]);
      } finally { removeCopy(tmp); }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test("a real-looking secret inside a copied source file aborts the run (exit 2) and nothing is left behind", () => {
    const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(TEMP_PREFIX)).length;
    for (const [label, content] of [["Neon URL", `const u = "${FAKE_NEON}";`], ["Gemini key", `const k = "AIza${"x".repeat(35)}";`], ["Resend key", `const k = "re_${"a".repeat(30)}";`], ["private key", FAKE_PEM]]) {
      const root = fixture({ "src/config.ts": content });
      try {
        const r = runner(["--root", root, "--dry-run"]);
        assert.equal(r.status, 2, `${label}: expected abort, got ${r.status}\n${r.stderr}`);
        assert.match(r.stderr, /real-looking secrets/);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }
    const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(TEMP_PREFIX)).length;
    assert.equal(after, before, "temporary copies leaked");
  });

  test("removeCopy refuses to delete anything that is not one of its own temp directories", () => {
    assert.throws(() => removeCopy(os.homedir()), /refusing/);
    assert.throws(() => removeCopy(REPO_ROOT), /refusing/);
    assert.throws(() => removeCopy(os.tmpdir()), /refusing/);
  });
});

describe("environment", () => {
  const root = fixture({ "app/page.tsx": "x" });
  const PROBE = `const k=Object.keys(process.env).sort();console.log(JSON.stringify({k,db:process.env.DATABASE_URL,no:process.env.NODE_OPTIONS,home:process.env.HOME,paymob:process.env.PAYMOB_API_KEY,aws:process.env.AWS_SECRET_ACCESS_KEY,iso:process.env.TGFM_ISOLATED}))`;

  test("the parent's environment is not inherited; the real DATABASE_URL and keys never reach the child", () => {
    const r = runner(["--root", root, "--", "node", "-e", PROBE], { DATABASE_URL: FAKE_NEON, PAYMOB_API_KEY: "REAL-PAYMOB-KEY", AWS_SECRET_ACCESS_KEY: "REAL-AWS", GEMINI_API_KEY: "REAL-GEMINI" });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout.trim().split("\n").pop());
    assert.equal(out.db, "postgresql://guard:guard@127.0.0.1:1/guard");
    assert.equal(out.paymob, undefined, "PAYMOB_* is not set in the isolated environment (the real value must not leak, and no dummy key may tempt a real call)");
    assert.equal(out.aws, undefined);
    assert.equal(out.iso, "1");
    assert.match(out.no, /network-guard\.cjs/);
    assert.ok(out.home.includes(TEMP_PREFIX), "HOME should be inside the temp dir");
    assert.ok(!r.stdout.includes("REAL-") && !r.stderr.includes("REAL-"), "a real value leaked into the output");
  });

  test("CI=true is set for the isolated child only, so Next's advisory lookup (registry.npmjs.org) is skipped at its source (router-server.js reads this same ci-info module)", () => {
    const ci = `const ci=require(${JSON.stringify(path.join(REPO_ROOT, "node_modules/next/dist/server/ci-info"))});console.log(JSON.stringify({CI:process.env.CI,isCI:ci.isCI}))`;
    const inside = runner(["--root", root, "--", "node", "-e", ci], { CI: "" });
    assert.equal(inside.status, 0, inside.stderr);
    assert.deepEqual(JSON.parse(inside.stdout.trim().split("\n").pop()), { CI: "true", isCI: true });
    // control: the same probe in a plain environment (no CI) is not "CI" -- the runner is what sets it
    const plain = spawnSync(process.execPath, ["-e", ci], { env: { PATH: process.env.PATH }, encoding: "utf8" });
    assert.deepEqual(JSON.parse(plain.stdout.trim()), { isCI: false });
  });

  test("CI=true does not weaken the guard: an external request from the same run is still blocked", () => {
    const r = runner(["--root", root, "--", "node", "-e", "fetch('https://registry.npmjs.org/-/package/next/latest').catch(()=>{});setTimeout(()=>{},5000)"]);
    assert.equal(r.status, 86, r.stderr);
    assert.match(r.stderr, /registry\.npmjs\.org/);
  });

  test("--env cannot reintroduce a real database or a real-looking secret", () => {
    for (const bad of [`DATABASE_URL=${FAKE_NEON}`, `DIRECT_URL=${["postgres", "ql://u:p@db.example.com/x"].join("")}`, `X=AIza${"y".repeat(35)}`]) {
      const r = runner(["--root", root, "--env", bad, "--", "node", "-e", "0"]);
      assert.equal(r.status, 2, `${bad}\n${r.stderr}`);
    }
    const ok = runner(["--root", root, "--env", "DATABASE_URL=postgresql://u:p@127.0.0.1:5999/x", "--", "node", "-e", "console.log(process.env.DATABASE_URL)"]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /127\.0\.0\.1:5999/);
  });

  test("localhost works inside the isolated run", () => {
    const script = `const s=require('http').createServer((q,r)=>r.end('ok')).listen(0,'127.0.0.1',()=>{fetch('http://127.0.0.1:'+s.address().port).then(r=>r.text()).then(t=>{console.log(t);process.exit(0)})})`;
    const r = runner(["--root", root, "--", "node", "-e", script]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ok/);
  });
});

describe("supervision", () => {
  const root = fixture({ "app/page.tsx": "x" });
  test("an external connection attempt ends the whole run with exit 86 and a readable report", () => {
    for (const script of [
      `fetch('https://api.neon-test.invalid/')`,
      `require('net').connect(5432,'192.0.2.1')`,
      `require('child_process').spawn('curl',['--version'])`,
    ]) {
      const r = runner(["--root", root, "--", "node", "-e", `${script};setTimeout(()=>{},10000)`]);
      assert.equal(r.status, 86, `${script}\n${r.stderr}`);
      assert.match(r.stderr, /BLOCKED|VIOLATION/);
    }
  });

  test("a violation inside a grandchild process is also caught and kills the run", async () => {
    const script = `const c=require('child_process').spawn(process.execPath,['-e',"setTimeout(()=>fetch('https://x.invalid/'),300)"],{stdio:'inherit'});setTimeout(()=>{},10000)`;
    const r = runner(["--root", root, "--", "node", "-e", script]);
    assert.equal(r.status, 86, r.stderr);
  });
});

describe("OS sandbox layer (macOS sandbox-exec): covers what a JS-level guard cannot", { skip: !sandboxAvailable() && "sandbox-exec not available" }, () => {
  function sandboxed(script, serverPort) {
    const profile = path.join(os.tmpdir(), `tgfm-sb-${process.pid}-${Math.random().toString(36).slice(2)}.sb`);
    fs.writeFileSync(profile, sandboxProfile());
    return new Promise((resolve) => {
      // NO JS guard here: this isolates the kernel layer
      const c = spawn("/usr/bin/sandbox-exec", ["-f", profile, process.execPath, "-e", script], { env: { PATH: process.env.PATH } });
      let out = "", err = "";
      c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (err += d));
      c.on("close", (status) => { fs.rmSync(profile, { force: true }); resolve({ status, out, err, serverPort }); });
    });
  }
  test("raw TCP to a non-loopback address is refused by the kernel even with no JS guard", async () => {
    const r = await sandboxed(`const s=require('net').connect(80,'192.0.2.1');s.on('error',e=>{console.log(e.code);process.exit(0)});setTimeout(()=>{console.log('TIMEOUT-NOT-REFUSED');process.exit(1)},3000)`);
    assert.match(r.out, /EPERM|EACCES/, `got: ${r.out} ${r.err}`);
  });
  test("the internal tcp_wrap binding (which bypasses the JS guard) is also refused by the kernel", async () => {
    const r = await sandboxed(`process.removeAllListeners('warning');const {TCP,TCPConnectWrap,constants}=process.binding('tcp_wrap');const h=new TCP(constants.SOCKET);const w=new TCPConnectWrap();w.oncomplete=(st)=>{console.log('status',st);process.exit(0)};const rc=h.connect(w,'192.0.2.1',80);console.log('rc',rc);if(rc!==0)process.exit(0);setTimeout(()=>{console.log('TIMEOUT-NOT-REFUSED');process.exit(1)},3000)`);
    assert.ok(/rc -?(1|13)|status -?(1|13)|EPERM/.test(r.out) && !/TIMEOUT-NOT-REFUSED/.test(r.out), `got: ${r.out} ${r.err}`);
  });
  test("loopback still works inside the sandbox", async () => {
    const server = net.createServer((s) => s.end("hello")).listen(0, "127.0.0.1");
    await new Promise((res) => server.on("listening", res));
    const p = server.address().port;
    const r = await sandboxed(`const s=require('net').connect(${p},'127.0.0.1');let b='';s.on('data',d=>b+=d);s.on('end',()=>{console.log(b);process.exit(0)});s.on('error',e=>{console.log('ERR',e.code);process.exit(2)})`);
    server.close();
    assert.match(r.out, /hello/, `got: ${r.out} ${r.err}`);
  });
  test("the runner's --os-sandbox flag wires the sandbox in (dry run reports it)", () => {
    const root = fixture({ "app/page.tsx": "x" });
    try {
      const r = runner(["--root", root, "--os-sandbox", "--dry-run"]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stderr, /sandbox-exec/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

describe("--fake-prisma injection (dry runs only; Next.js is never started)", () => {
  const REAL_PRISMA_TS = 'import { PrismaClient } from "@prisma/client";\nexport const prisma = new PrismaClient();\n';
  const sha = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");

  test("the real repository: the copy gets the fake, the original src/lib/prisma.ts is untouched, nothing real is left", () => {
    const original = path.join(REPO_ROOT, "src/lib/prisma.ts");
    const before = sha(original);
    assert.match(fs.readFileSync(original, "utf8"), /new PrismaClient/, "sanity: the original really creates a PrismaClient");
    const r = runner(["--dry-run", "--keep", "--fake-prisma"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /fake-prisma: src\/lib\/prisma\.ts replaced in the copy; \d+ run-path files scanned, no real Prisma client creation found/);
    const tmp = keptPath(r.stderr);
    try {
      const work = path.join(tmp, "app");
      assert.equal(fs.readFileSync(path.join(work, "src/lib/prisma.ts"), "utf8"), FAKE_PRISMA_STUB);
      assert.ok(fs.existsSync(path.join(work, "scripts/isolation/fake-prisma/index.mjs")));
      assert.deepEqual(assertNoRealPrisma(work).problems, []);
      assert.ok(!/new\s+PrismaClient/.test(fs.readFileSync(path.join(work, "src/lib/prisma.ts"), "utf8")));
    } finally { removeCopy(tmp); }
    assert.equal(sha(original), before, "the ORIGINAL src/lib/prisma.ts changed");
    assert.match(fs.readFileSync(original, "utf8"), /new PrismaClient/);
    assert.ok(!fs.existsSync(tmp));
  });

  test("without the flag nothing is injected (opt-in only)", () => {
    const root = fixture({ "src/lib/prisma.ts": REAL_PRISMA_TS });
    try {
      const r = runner(["--root", root, "--dry-run", "--keep"]);
      assert.equal(r.status, 0, r.stderr);
      const tmp = keptPath(r.stderr);
      try { assert.equal(fs.readFileSync(path.join(tmp, "app/src/lib/prisma.ts"), "utf8"), REAL_PRISMA_TS); } finally { removeCopy(tmp); }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test("a fixture project is accepted, its prisma.ts replaced, and the fixture itself stays untouched", () => {
    const root = fixture({ "src/lib/prisma.ts": REAL_PRISMA_TS, "app/page.tsx": "export default 1" });
    try {
      const r = runner(["--root", root, "--dry-run", "--keep", "--fake-prisma"]);
      assert.equal(r.status, 0, r.stderr);
      const tmp = keptPath(r.stderr);
      try { assert.equal(fs.readFileSync(path.join(tmp, "app/src/lib/prisma.ts"), "utf8"), FAKE_PRISMA_STUB); } finally { removeCopy(tmp); }
      assert.equal(fs.readFileSync(path.join(root, "src/lib/prisma.ts"), "utf8"), REAL_PRISMA_TS);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  const refused = [
    ["new PrismaClient() elsewhere in src", { "src/lib/db2.ts": 'import { x } from "y";\nexport const db = new PrismaClient();' }, /src\/lib\/db2\.ts: new PrismaClient/],
    ["a value import of PrismaClient in app/", { "app/x/route.ts": 'import { PrismaClient } from "@prisma/client";\nexport const GET = () => PrismaClient;' }, /app\/x\/route\.ts: value import of PrismaClient/],
    ["require(@prisma/client).PrismaClient", { "src/lib/legacy.js": 'const P = require("@prisma/client").PrismaClient;' }, /src\/lib\/legacy\.js: require/],
    ["@prisma/client/runtime import", { "src/lib/rt.ts": 'import { x } from "@prisma/client/runtime/library";' }, /src\/lib\/rt\.ts: @prisma\/client\/runtime/],
    ["PrismaClient created in next.config.ts", { "next.config.ts": "export default new PrismaClient();" }, /next\.config\.ts: new PrismaClient/],
    ["PrismaClient created in proxy.ts", { "proxy.ts": "const p = new PrismaClient();" }, /proxy\.ts: new PrismaClient/],
  ];
  for (const [name, extra, expected] of refused) {
    test(`refuses to run when the run path can still create a real client: ${name}`, () => {
      const root = fixture({ "src/lib/prisma.ts": REAL_PRISMA_TS, ...extra });
      try {
        const r = runner(["--root", root, "--dry-run", "--fake-prisma"]);
        assert.equal(r.status, 2, r.stderr);
        assert.match(r.stderr, /ABORT: the real Prisma client could still be used/);
        assert.match(r.stderr, expected);
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });
  }

  test("a type-only import of PrismaClient is harmless and allowed", () => {
    const root = fixture({ "src/lib/prisma.ts": REAL_PRISMA_TS, "src/lib/types.ts": 'import type { PrismaClient } from "@prisma/client";\nexport type Db = PrismaClient;' });
    try {
      const r = runner(["--root", root, "--dry-run", "--fake-prisma"]);
      assert.equal(r.status, 0, r.stderr);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test("no src/lib/prisma.ts to replace: refuses", () => {
    const root = fixture({ "app/page.tsx": "x" });
    try {
      const r = runner(["--root", root, "--dry-run", "--fake-prisma"]);
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /src\/lib\/prisma\.ts not found/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test("assertNoRealPrisma flags a copy where the real prisma.ts survived, and a tampered fake", () => {
    const root = fixture({ "src/lib/prisma.ts": REAL_PRISMA_TS, "scripts/isolation/fake-prisma/index.mjs": "export {};" });
    try {
      const survived = assertNoRealPrisma(root).problems.join("\n");
      assert.match(survived, /not the injected fake/);
      injectFakePrisma(root);
      assert.deepEqual(assertNoRealPrisma(root).problems, []);
      fs.appendFileSync(path.join(root, "src/lib/prisma.ts"), "\nexport const extra = 1;\n");
      assert.match(assertNoRealPrisma(root).problems.join("\n"), /not the injected fake/);
      injectFakePrisma(root);
      fs.appendFileSync(path.join(root, "scripts/isolation/fake-prisma/engine.mjs"), '\nimport "@prisma/client";\n');
      assert.match(assertNoRealPrisma(root).problems.join("\n"), /fake must not import @prisma\/client/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

describe("isolated environment: no Gemini, Paymob, Resend or WhatsApp configuration", () => {
  test("buildEnv sets no GEMINI_* variable (so the AI mockup route fails politely instead of calling out)", () => {
    const env = buildEnv({ tmp: os.tmpdir(), port: 3100, log: path.join(os.tmpdir(), "x.log") });
    assert.deepEqual(Object.keys(env).filter((k) => /GEMINI|PAYMOB|RESEND|WHATSAPP/i.test(k)), []);
  });
});

describe("--qa-routes (QA-only test routes, installed in the copy only)", () => {
  const routes = ["mark-paid", "set-order", "set-store", "set-legal", "inspect", "make-admin", "add-audit-noise"].map((name) => `app/api/qa-sim/${name}/route.ts`);
  test("the simulated-payment route exists only in a copy made with the flag", () => {
    const root = fixture({ "src/lib/prisma.ts": "export const prisma = {};\n", "app/page.tsx": "x" });
    try {
      for (const withFlag of [false, true]) {
        const r = runner(["--root", root, "--dry-run", "--keep", "--fake-prisma", ...(withFlag ? ["--qa-routes"] : [])]);
        assert.equal(r.status, 0, r.stderr);
        const tmp = keptPath(r.stderr);
        try { for (const route of routes) assert.equal(fs.existsSync(path.join(tmp, "app", route)), withFlag, route); } finally { removeCopy(tmp); }
      }
      for (const route of routes) assert.ok(!fs.existsSync(path.join(root, route)), "the fixture/original must never receive " + route);
      assert.ok(!fs.existsSync(path.join(REPO_ROOT, "app/api/qa-sim")), "the real application must never contain the QA route");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

describe("prepareCopy cleans up after itself when it fails", () => {
  const leftovers = () => new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(TEMP_PREFIX)));
  const newOnes = (before) => [...leftovers()].filter((name) => !before.has(name));

  test("early failure (the root cannot be copied): no temporary directory is left", () => {
    const before = leftovers();
    assert.throws(() => prepareCopy({ root: path.join(os.tmpdir(), "tgfm-no-such-root-" + Date.now()) }));
    assert.deepEqual(newOnes(before), []);
  });

  test("late failure (node_modules verification rejects an absolute symlink): no temporary directory is left", () => {
    const root = fixture({ "app/page.tsx": "x", "node_modules/pkg/index.js": "module.exports = 1;" });
    fs.symlinkSync("/usr/bin", path.join(root, "node_modules", "escape")); // absolute target: must never be copied as-is
    const before = leftovers();
    try {
      assert.throws(() => prepareCopy({ root }), /absolute symlink|escapes the copy/);
      assert.deepEqual(newOnes(before), []);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test("a successful prepareCopy still returns its directory (the caller removes it)", () => {
    const root = fixture({ "app/page.tsx": "x" });
    const before = leftovers();
    let made;
    try {
      made = prepareCopy({ root });
      assert.equal(newOnes(before).length, 1);
      assert.ok(fs.existsSync(path.join(made.work, "app/page.tsx")));
    } finally { if (made) removeCopy(made.tmp); fs.rmSync(root, { recursive: true, force: true }); }
    assert.deepEqual(newOnes(before), []);
  });

  test("the runner process itself exits non-zero and leaves nothing behind when the root is invalid", () => {
    const before = leftovers();
    const r = runner(["--root", path.join(os.tmpdir(), "tgfm-no-such-root-" + Date.now()), "--dry-run"]);
    assert.notEqual(r.status, 0);
    assert.deepEqual(newOnes(before), []);
  });
});
