// Tests for the single local stub in network-guard.cjs (Next's npm dist-tags handshake).
// SAFETY: every probe runs under macOS sandbox-exec with ALL network denied, so even a broken guard could not
// reach registry.npmjs.org. Nothing here starts the app.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const GUARD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../network-guard.cjs");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "tgfm-stub-test-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const HAVE_SANDBOX = process.platform === "darwin" && fs.existsSync("/usr/bin/sandbox-exec");
const PROFILE = path.join(TMP, "deny.sb");
fs.writeFileSync(PROFILE, "(version 1)(allow default)(deny network*)");
const URL_OK = "https://registry.npmjs.org/-/package/next/dist-tags";

function run(script) {
  const log = path.join(TMP, `log-${Math.random().toString(36).slice(2)}.jsonl`);
  const env = { PATH: process.env.PATH, TGFM_GUARD_LOG: log, NODE_OPTIONS: `--require ${JSON.stringify(GUARD)}` };
  return new Promise((resolve) => {
    const c = spawn("/usr/bin/sandbox-exec", ["-f", PROFILE, process.execPath, "-e", script], { env });
    let stdout = "", stderr = "";
    c.stdout.on("data", (d) => (stdout += d)); c.stderr.on("data", (d) => (stderr += d));
    c.on("close", (status) => {
      const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
      resolve({ status, stdout, stderr, violations: read(log), uses: read(log + ".stub-uses") });
    });
  });
}

describe("dist-tags local stub", { skip: !HAVE_SANDBOX && "needs macOS sandbox-exec" }, () => {
  test("the exact request is answered locally with a synthetic body, no violation, use logged", async () => {
    const r = await run(`fetch(${JSON.stringify(URL_OK)}).then(async r=>{console.log(r.status,r.headers.get("x-tgfm-synthetic"),await r.text())})`);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^200 1 \{"latest":"16\.4\.5","canary":"16\.4\.5","_synthetic":"tgfm-isolation-local-stub"\}/);
    assert.equal(r.violations.length, 0);
    assert.equal(r.uses.length, 1);
    assert.match(r.uses[0].note, /LOCALLY/);
  });
  test("GET given explicitly and a URL object are the same request", async () => {
    const r = await run(`fetch(new URL(${JSON.stringify(URL_OK)}),{method:"get"}).then(r=>console.log(r.status))`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.violations.length, 0);
    assert.equal(r.uses.length, 1);
  });
  for (const [name, call] of [
    ["another path on the same host", `fetch("https://registry.npmjs.org/-/package/react/dist-tags")`],
    ["a query string appended", `fetch(${JSON.stringify(URL_OK + "?x=1")})`],
    ["a trailing slash", `fetch(${JSON.stringify(URL_OK + "/")})`],
    ["http instead of https", `fetch("http://registry.npmjs.org/-/package/next/dist-tags")`],
    ["another host, same path", `fetch("https://registry.example.invalid/-/package/next/dist-tags")`],
    ["a different method", `fetch(${JSON.stringify(URL_OK)},{method:"POST"})`],
    ["extra options (headers)", `fetch(${JSON.stringify(URL_OK)},{headers:{a:"b"}})`],
    ["a Request object", `fetch(new Request(${JSON.stringify(URL_OK)}))`],
    ["http.get to the same host", `require("http").get("http://registry.npmjs.org/-/package/next/dist-tags")`],
    ["https.get to the same host", `require("https").get(${JSON.stringify(URL_OK)})`],
  ]) {
    test(`still blocked and fatal: ${name}`, async () => {
      const r = await run(`${call}.catch(()=>{});setTimeout(()=>{},3000)`);
      assert.equal(r.status, 86, `expected guard exit 86, got ${r.status}: ${r.stderr}`);
      assert.ok(r.violations.length >= 1);
      assert.equal(r.uses.length, 0, "the stub must not answer this");
    });
  }
});
