// Process-group cleanup tests for run-isolated.mjs. Everything runs against a tiny fixture project (no Next.js,
// no node_modules copy). A "bystander" process started OUTSIDE the runner must survive every scenario.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const RUNNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../run-isolated.mjs");
const dirs = [];
const bystanders = [];
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); } throw new Error("timeout"); }

after(() => {
  for (const pid of bystanders) { try { process.kill(pid, "SIGKILL"); } catch {} }
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function bystander() {
  const c = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  bystanders.push(c.pid);
  return c.pid;
}

// childBody runs inside the runner as the "command": it spawns a grandchild, writes both pids, then does `tail`.
async function scenario({ tail, ignoreTerm = false, exits = false, act }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tgfm-proc-fixture-"));
  dirs.push(root);
  fs.writeFileSync(path.join(root, "page.txt"), "x");
  const pidFile = path.join(root, "pids.json");
  const script = `
    const {spawn}=require("node:child_process"),fs=require("node:fs");
    ${ignoreTerm ? 'process.on("SIGTERM",()=>{});' : ""}
    const g=spawn(process.execPath,["-e",${JSON.stringify((ignoreTerm ? 'process.on("SIGTERM",()=>{});' : "") + "setInterval(()=>{},1000)")}],{stdio:"ignore"});
    fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify({main:process.pid,grandchild:g.pid}));
    ${tail}`;
  // the fixture holds the script outside of the copied tree on purpose: it is passed with -e
  const bp = bystander();
  const runner = spawn(process.execPath, [RUNNER, "--root", root, "--", "node", "-e", script], {
    stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH, TGFM_ISOLATION_GRACE_MS: "800" },
  });
  let stderr = "";
  runner.stderr.on("data", (d) => (stderr += d));
  const exit = new Promise((r) => runner.on("exit", (code, sig) => r({ code, sig })));
  const pids = await waitFor(() => { try { return JSON.parse(fs.readFileSync(pidFile, "utf8")); } catch { return null; } });
  const work = /\[isolated\] copy: (\S+)/.exec(stderr)[1];
  const tmp = path.dirname(work);
  if (!exits) assert.ok(fs.existsSync(tmp), "temp copy should exist while running");
  const res = await act(runner, exit);
  const result = await Promise.race([exit, sleep(15000).then(() => { throw new Error("runner did not exit"); })]);
  await sleep(300);
  const report = { runnerPid: runner.pid, ...pids, bystander: bp, result, tmp, stderr };
  console.log(`# pids before: runner=${runner.pid} main=${pids.main} grandchild=${pids.grandchild} bystander=${bp}`);
  console.log(`# after: main alive=${alive(pids.main)} grandchild alive=${alive(pids.grandchild)} bystander alive=${alive(bp)} tmp exists=${fs.existsSync(tmp)}`);
  void res;
  return report;
}

function assertClean(r) {
  assert.equal(alive(r.main), false, "main command still running");
  assert.equal(alive(r.grandchild), false, "grandchild still running");
  assert.equal(alive(r.bystander), true, "a process outside the group was affected");
  assert.equal(fs.existsSync(r.tmp), false, "temp copy left behind");
}

describe("runner process-group cleanup", () => {
  test("SIGTERM to the runner stops the command, its descendants, and removes the copy", async () => {
    const r = await scenario({ tail: "setInterval(()=>{},1000)", act: async (runner) => runner.kill("SIGTERM") });
    assert.equal(r.result.code, 143);
    assertClean(r);
  });

  test("SIGINT to the runner does the same", async () => {
    const r = await scenario({ tail: "setInterval(()=>{},1000)", act: async (runner) => runner.kill("SIGINT") });
    assert.equal(r.result.code, 130);
    assertClean(r);
  });

  test("a command that ignores SIGTERM is force-killed after the grace period", async () => {
    const r = await scenario({ tail: 'setInterval(()=>{},1000)', ignoreTerm: true, act: async (runner) => runner.kill("SIGTERM") });
    assert.equal(r.result.code, 143);
    assertClean(r);
  });

  test("a failing command (exit 3) that leaves a descendant behind: descendant killed, exit code kept, copy removed", async () => {
    const r = await scenario({ tail: "process.exit(3)", exits: true, act: async () => {} });
    assert.equal(r.result.code, 3);
    assertClean(r);
  });

  test("a successful command (exit 0) that leaves a descendant behind: descendant killed, copy removed", async () => {
    const r = await scenario({ tail: "process.exit(0)", exits: true, act: async () => {} });
    assert.equal(r.result.code, 0);
    assertClean(r);
  });

  test("the command crashing (uncaught exception) is cleaned up too", async () => {
    const r = await scenario({ tail: 'setTimeout(()=>{throw new Error("boom")},200)', exits: true, act: async () => {} });
    assert.notEqual(r.result.code, 0);
    assertClean(r);
  });
});
