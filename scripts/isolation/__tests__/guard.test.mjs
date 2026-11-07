// Network guard tests. Standalone: `node --test scripts/isolation/__tests__/` (Node's built-in runner; nothing to install).
//
// SAFETY: every "blocked" probe targets only addresses that can never reach a real service --
// RFC 2606 `.invalid` names (never resolve) and RFC 5737 TEST-NET-1 (192.0.2.0/24, not routable) --
// so even if the guard were broken these tests could not contact Neon, Paymob, Gemini, Resend or WhatsApp.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const GUARD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../network-guard.cjs");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "tgfm-guard-test-"));
const INVALID = "db.ep-test-123.invalid"; // stands in for Neon / Paymob / Gemini / Resend / WhatsApp hosts
const TESTNET = "192.0.2.1";

// Async on purpose: the local test server lives in THIS process and must keep answering while the probe runs.
function run(script, { guard = true } = {}) {
  const log = path.join(TMP, `log-${Math.random().toString(36).slice(2)}.jsonl`);
  const env = { PATH: process.env.PATH, TGFM_GUARD_LOG: log };
  if (guard) env.NODE_OPTIONS = `--require ${JSON.stringify(GUARD)}`;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", script], { env });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      const violations = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
      resolve({ status, signal, stdout, stderr, violations });
    });
  });
}

let server, port;
before(async () => {
  server = http.createServer((req, res) => res.end("local-ok"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});
after(() => { server.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

describe("localhost is allowed", () => {
  test("http.get to 127.0.0.1", async () => {
    const r = await run(`require('http').get('http://127.0.0.1:${port}/',res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>{console.log(b);process.exit(0)})}).on('error',e=>{console.error(e.message);process.exit(3)})`);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /local-ok/);
    assert.equal(r.violations.length, 0);
  });
  test("global fetch to 127.0.0.1", async () => {
    const r = await run(`fetch('http://127.0.0.1:${port}/').then(r=>r.text()).then(t=>{console.log(t);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(3)})`);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /local-ok/);
    assert.equal(r.violations.length, 0);
  });
  test("net.connect to 127.0.0.1 and to the name localhost", async () => {
    const r = await run(`const net=require('net');let n=0;const done=()=>{if(++n===2)process.exit(0)};
      for(const h of ['127.0.0.1','localhost']){const s=net.connect(${port},h,()=>{s.destroy();done()});s.on('error',e=>{console.error(h,e.message);process.exit(3)})}`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.violations.length, 0);
  });
  test("dns lookup of localhost", async () => {
    const r = await run(`require('dns').lookup('localhost',(e,a)=>{if(e){console.error(e.message);process.exit(3)}console.log(a);process.exit(0)})`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.violations.length, 0);
  });
  test("starting a local server and connecting to it", async () => {
    const r = await run(`const http=require('http');const s=http.createServer((q,r)=>r.end('x')).listen(0,'127.0.0.1',()=>{http.get({host:'127.0.0.1',port:s.address().port},res=>{res.resume();res.on('end',()=>process.exit(0))})})`);
    assert.equal(r.status, 0, r.stderr);
  });
  test("starting another node process is allowed", async () => {
    const r = await run(`const r=require('child_process').spawnSync(process.execPath,['-e','process.exit(0)']);process.exit(r.status)`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.violations.length, 0);
  });
});

// [label, script, expected violation kind (substring)]
const BLOCKED = [
  ["net.connect to an IP", `require('net').connect(80,'${TESTNET}')`, "net.connect"],
  ["net.createConnection to a hostname", `require('net').createConnection({host:'${INVALID}',port:5432})`, "net.createConnection"],
  ["new net.Socket().connect", `new (require('net').Socket)().connect(443,'${TESTNET}')`, "net.connect"],
  ["tls.connect (databases such as Neon)", `require('tls').connect({host:'${INVALID}',port:5432,servername:'${INVALID}'})`, "tls.connect"],
  ["http.get", `require('http').get('http://${TESTNET}/')`, "http.get"],
  ["https.request with options", `require('https').request({host:'${INVALID}',path:'/'}).end()`, "https.request"],
  ["https.get with URL object", `require('https').get(new URL('https://accept.paymob.invalid/api'))`, "https.get"],
  ["global fetch (undici) to a hostname", `fetch('https://generativelanguage.googleapis.invalid/v1beta/x')`, "fetch"],
  ["global fetch to an IP", `fetch('http://${TESTNET}:9/')`, "fetch"],
  ["fetch with a Request object", `fetch(new Request('https://api.resend.invalid/emails',{method:'POST'}))`, "fetch"],
  ["WebSocket", `new WebSocket('wss://${INVALID}/socket')`, "WebSocket"],
  ["http2.connect", `require('http2').connect('https://${INVALID}')`, "http2.connect"],
  ["dns.lookup", `require('dns').lookup('${INVALID}',()=>{})`, "dns.lookup"],
  ["dns.resolve4", `require('dns').resolve4('${INVALID}',()=>{})`, "dns.resolve4"],
  ["dns.promises.resolve", `require('dns').promises.resolve('${INVALID}')`, "dns.promises"],
  ["dns.Resolver", `new (require('dns').Resolver)().resolve4('${INVALID}',()=>{})`, "dns.Resolver"],
  ["dns.promises.Resolver", `new (require('dns').promises.Resolver)().resolve4('${INVALID}')`, "dns.Resolver"],
  ["dgram send (UDP)", `const s=require('dgram').createSocket('udp4');s.send(Buffer.from('x'),53,'${TESTNET}')`, "dgram"],
  ["child_process.spawn of curl", `require('child_process').spawn('curl',['--version'])`, "child_process.spawn"],
  ["child_process.spawnSync of a shell", `require('child_process').spawnSync('/bin/sh',['-c','echo hi'])`, "child_process.spawnSync"],
  ["child_process.exec through a shell", `require('child_process').exec('echo hi')`, "child_process.exec"],
  ["child_process.execSync chaining after node", `require('child_process').execSync('node -v; echo hi')`, "child_process.execSync"],
  ["child_process.execSync command substitution", `require('child_process').execSync('node -e "$(echo 1)"')`, "child_process.execSync"],
  ["child_process.execFile ssh", `require('child_process').execFile('ssh',['-V'],()=>{})`, "child_process.execFile"],
  ["spawn node with shell:true plus another program", `require('child_process').spawn('node -v && curl --version',{shell:true})`, "child_process.spawn"],
];
describe("everything that is not localhost is blocked (exit 86 + violation log)", () => {
  for (const [label, script, kind] of BLOCKED) {
    test(label, async () => {
      const r = await run(script);
      assert.equal(r.status, 86, `expected exit 86, got ${r.status} (signal ${r.signal})\n${r.stderr}`);
      assert.ok(r.violations.length >= 1, "violation not logged");
      assert.ok(r.violations.some((v) => v.kind.includes(kind) || kind.includes(v.kind)), `kinds: ${r.violations.map((v) => v.kind)}`);
    });
  }
});

describe("the guard cannot be shed by a child process", () => {
  test("child started with a replaced env still carries the guard", async () => {
    const r = await run(`const r=require('child_process').spawnSync(process.execPath,['-e',"fetch('https://${INVALID}')"],{env:{PATH:process.env.PATH}});process.exit(r.status)`);
    assert.equal(r.status, 86, r.stderr);
    assert.ok(r.violations.length >= 1);
  });
  test("child started with an env that has an unrelated NODE_OPTIONS still carries the guard", async () => {
    const r = await run(`const r=require('child_process').spawnSync(process.execPath,['-e',"require('net').connect(80,'${TESTNET}')"],{env:{PATH:process.env.PATH,NODE_OPTIONS:'--max-old-space-size=256'}});process.exit(r.status)`);
    assert.equal(r.status, 86, r.stderr);
  });
  test("fork carries the guard", async () => {
    fs.writeFileSync(path.join(TMP, "child.js"), `fetch('https://${INVALID}')`);
    const r = await run(`const c=require('child_process').fork(${JSON.stringify(path.join(TMP, "child.js"))},{env:{PATH:process.env.PATH}});c.on('exit',code=>process.exit(code))`);
    assert.equal(r.status, 86, r.stderr);
  });
  test("execSync of a bare node command carries the guard", async () => {
    const r = await run(`try{require('child_process').execSync('node -e "fetch(\\'https://${INVALID}\\')"',{stdio:'ignore'})}catch(e){process.exit(e.status)}`);
    assert.equal(r.status, 86, r.stderr);
  });
});

describe("worker threads", () => {
  test("a worker that tries an external fetch brings the whole process down", async () => {
    const r = await run(`const {Worker}=require('worker_threads');new Worker("fetch('https://${INVALID}/')",{eval:true});setTimeout(()=>process.exit(0),4000)`);
    assert.notEqual(r.status, 0, "process survived a blocked worker");
    assert.ok(r.violations.length >= 1, "worker violation not logged");
  });
});

describe("control: without the guard the probe is not blocked (proves the tests discriminate)", () => {
  test("a localhost-only probe behaves identically with and without the guard", async () => {
    const script = `fetch('http://127.0.0.1:${port}/').then(()=>process.exit(0)).catch(()=>process.exit(3))`;
    assert.equal((await run(script, { guard: false })).status, 0);
    assert.equal((await run(script, { guard: true })).status, 0);
  });
  test("a blocked probe is only stopped by the guard (without it the process is not killed with 86)", async () => {
    // .invalid never resolves, so without the guard this ends with a plain network error (exit 3), never 86
    const script = `fetch('https://${INVALID}/').then(()=>process.exit(0)).catch(()=>process.exit(3))`;
    assert.equal((await run(script, { guard: false })).status, 3);
    assert.equal((await run(script, { guard: true })).status, 86);
  });
});
