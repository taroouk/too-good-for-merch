/* eslint-disable */
// file: scripts/isolation/network-guard.cjs
//
// Network guard for LOCAL TGFM TESTS. Preloaded into every Node process of the
// test run (NODE_OPTIONS="--require .../network-guard.cjs"), it allows traffic
// to localhost only. Any attempt to reach anything else -- a database such as
// Neon, Paymob, Gemini, Resend, WhatsApp, or any other host -- is recorded in
// the violation log and the process is killed with exit code 86.
//
// Layers it patches (all fail CLOSED):
//   net.Socket#connect / net.connect / net.createConnection   (everything TCP:
//       http, https, tls, undici/fetch, pg, Prisma's JS paths, websockets)
//   tls.connect, http.request/get, https.request/get, http2.connect
//   globalThis.fetch / WebSocket (URL checked before undici runs)
//   dns.lookup / resolve* / Resolver / dns.promises.*  (no external name lookups)
//   dgram (UDP) connect/send
//   child_process.* (only `node` may be started; shells/curl/ssh/etc. are killed,
//       and every child gets this guard injected into NODE_OPTIONS so it cannot
//       be shed by passing a custom env)
//   worker_threads (preload applies to workers through NODE_OPTIONS)
//
// Known limits are listed in scripts/isolation/README.md -- notably: native
// addons that open sockets in C code, code that edits NODE_OPTIONS/uses an
// already-started process, and non-Node processes. The OS sandbox layer
// (run-isolated.mjs --os-sandbox) exists to cover those.
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

if (globalThis.__TGFM_NETWORK_GUARD__) return;
Object.defineProperty(globalThis, "__TGFM_NETWORK_GUARD__", { value: true });

const EXIT_CODE = 86;
const LOG = process.env.TGFM_GUARD_LOG || path.join(os.tmpdir(), "tgfm-network-guard.log");
const GUARD_PATH = __filename;
let isMainThread = true;
try { isMainThread = require("node:worker_threads").isMainThread; } catch {}

// ------------------------------------------------------------------ policy
function isLoopbackHost(host) {
  if (host === undefined || host === null || host === "") return true; // Node's default is localhost
  let h = String(host).trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  const zone = h.indexOf("%");
  if (zone > -1) h = h.slice(0, zone);
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  if (h.startsWith("::ffff:")) return isLoopbackHost(h.slice(7));
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) return Number(m[1]) === 127; // 127.0.0.0/8
  return false; // any other name or address
}

const ALLOWED_EXECUTABLES = new Set(["node", path.basename(process.execPath)]);
function isAllowedExecutable(file) {
  if (typeof file !== "string") return false;
  if (file === process.execPath) return true;
  return ALLOWED_EXECUTABLES.has(path.basename(file));
}

// ---------------------------------------------------------------- violation
function violation(kind, target, detail) {
  const record = {
    at: new Date().toISOString(),
    pid: process.pid,
    main: isMainThread,
    kind,
    target: String(target).slice(0, 300),
    detail: detail ? String(detail).slice(0, 300) : undefined,
    argv: process.argv.slice(1, 3),
  };
  try { fs.appendFileSync(LOG, JSON.stringify(record) + "\n"); } catch {}
  try { fs.writeSync(2, `\n[tgfm-network-guard] BLOCKED ${kind} -> ${record.target}. Killing process.\n`); } catch {}
  if (isMainThread) {
    process.exit(EXIT_CODE);
  }
  // inside a worker thread process.exit only ends the thread: end the whole process
  try { process.kill(process.pid, "SIGKILL"); } catch {}
  throw new Error(`tgfm-network-guard: blocked ${kind} -> ${record.target}`);
}

function checkHost(kind, host, detail) {
  if (!isLoopbackHost(host)) violation(kind, host, detail);
}

// ------------------------------------------------------------- argument parsing
function hostFromConnectArgs(args) {
  // net.connect(options[, cb]) | net.connect(path[, cb]) | net.connect(port[, host][, cb])
  const [a0, a1] = args;
  if (a0 && typeof a0 === "object" && !Array.isArray(a0)) {
    if (a0.path !== undefined && a0.host === undefined && a0.port === undefined) return { local: true };
    return { host: a0.host };
  }
  if (typeof a0 === "string" && Number.isNaN(Number(a0))) return { local: true }; // unix socket path
  return { host: typeof a1 === "string" ? a1 : undefined };
}

function hostFromUrlLike(input) {
  try {
    if (input && typeof input === "object" && typeof input.url === "string") input = input.url; // Request
    const u = input instanceof URL ? input : new URL(String(input));
    if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "file:") return { local: true };
    return { host: u.hostname };
  } catch {
    return { host: String(input) }; // unparseable -> treated as a (non-loopback) name
  }
}

function hostFromRequestArgs(args) {
  // http.request(options|url[, options][, cb])
  let host;
  for (const a of args) {
    if (typeof a === "string" || a instanceof URL) return hostFromUrlLike(a);
    if (a && typeof a === "object" && !Array.isArray(a)) {
      if (a.hostname !== undefined || a.host !== undefined) host = a.hostname ?? a.host;
      if (a.socketPath) return { local: true };
      if (typeof a.host === "string" && a.host.includes(":") && !a.host.includes("]") && a.hostname === undefined) host = a.host.split(":")[0];
    }
  }
  return { host };
}

// ------------------------------------------------------------------- net / tls
const net = require("node:net");
const origSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedSocketConnect(...args) {
  // net.Socket#connect(options|path|port, host?, cb?) -- also receives the normalised array form
  let probe = args;
  if (Array.isArray(args[0])) probe = args[0]; // [options, cb] internal form
  const r = hostFromConnectArgs(probe);
  if (!r.local) checkHost("net.connect", r.host);
  return origSocketConnect.apply(this, args);
};
for (const name of ["connect", "createConnection"]) {
  const orig = net[name];
  net[name] = function guardedNet(...args) {
    const r = hostFromConnectArgs(args);
    if (!r.local) checkHost(`net.${name}`, r.host);
    return orig.apply(this, args);
  };
}

const tls = require("node:tls");
const origTlsConnect = tls.connect;
tls.connect = function guardedTlsConnect(...args) {
  const first = args[0];
  if (first && typeof first === "object" && first.socket) return origTlsConnect.apply(this, args); // wraps an already-checked socket
  const r = hostFromConnectArgs(args);
  if (!r.local) checkHost("tls.connect", r.host ?? (first && first.servername));
  return origTlsConnect.apply(this, args);
};

// ------------------------------------------------------------------ http(s)/2
for (const modName of ["http", "https"]) {
  const mod = require(`node:${modName}`);
  for (const fn of ["request", "get"]) {
    const orig = mod[fn];
    mod[fn] = function guardedHttp(...args) {
      const r = hostFromRequestArgs(args);
      if (!r.local) checkHost(`${modName}.${fn}`, r.host);
      return orig.apply(this, args);
    };
  }
}
try {
  const http2 = require("node:http2");
  const origH2 = http2.connect;
  http2.connect = function guardedHttp2(authority, ...rest) {
    const r = hostFromUrlLike(authority);
    if (!r.local) checkHost("http2.connect", r.host);
    return origH2.call(this, authority, ...rest);
  };
} catch {}

// ----------------------------------------------------------------------- DNS
const dns = require("node:dns");
const blockName = (kind) => function guardedDns(hostname, ...rest) {
  if (!isLoopbackHost(hostname)) violation(kind, hostname);
  return dns[`__orig_${kind}`].call(this, hostname, ...rest);
};
for (const fn of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCname", "resolveMx", "resolveNs", "resolveSrv", "resolveTxt", "resolvePtr", "resolveNaptr", "resolveSoa", "resolveCaa", "reverse"]) {
  if (typeof dns[fn] !== "function") continue;
  Object.defineProperty(dns, `__orig_${fn}`, { value: dns[fn], enumerable: false });
  if (fn === "reverse") {
    dns[fn] = function guardedReverse(ip, ...rest) { if (!isLoopbackHost(ip)) violation(`dns.${fn}`, ip); return dns.__orig_reverse.call(this, ip, ...rest); };
  } else {
    dns[fn] = function (hostname, ...rest) {
      if (!isLoopbackHost(hostname)) violation(`dns.${fn}`, hostname);
      return dns[`__orig_${fn}`].call(this, hostname, ...rest);
    };
  }
}
const dnsPromises = dns.promises;
for (const fn of Object.keys(dnsPromises)) {
  if (typeof dnsPromises[fn] !== "function" || fn === "Resolver" || fn === "getServers" || fn === "setServers" || fn === "setDefaultResultOrder" || fn === "getDefaultResultOrder") continue;
  const orig = dnsPromises[fn];
  dnsPromises[fn] = function guardedDnsPromise(hostname, ...rest) {
    if (!isLoopbackHost(hostname)) violation(`dns.promises.${fn}`, hostname);
    return orig.call(this, hostname, ...rest);
  };
}
for (const R of [dns.Resolver, dnsPromises.Resolver]) {
  if (!R || !R.prototype) continue;
  for (const fn of Object.getOwnPropertyNames(R.prototype)) {
    if (!/^(resolve|reverse)/.test(fn) || typeof R.prototype[fn] !== "function") continue;
    const orig = R.prototype[fn];
    R.prototype[fn] = function guardedResolver(hostname, ...rest) {
      if (!isLoopbackHost(hostname)) violation(`dns.Resolver#${fn}`, hostname);
      return orig.call(this, hostname, ...rest);
    };
  }
}

// ---------------------------------------------------------------------- UDP
try {
  const dgram = require("node:dgram");
  const proto = dgram.Socket.prototype;
  for (const fn of ["connect", "send"]) {
    const orig = proto[fn];
    proto[fn] = function guardedDgram(...args) {
      // connect(port, address, cb) / send(msg, [offset, length,] port, address, cb) / send(msg, port, address, cb)
      const host = args.find((a, i) => i > 0 && typeof a === "string");
      if (host !== undefined && !isLoopbackHost(host)) violation(`dgram.${fn}`, host);
      return orig.apply(this, args);
    };
  }
} catch {}

// ------------------------------------------------------------ fetch / sockets
const origFetch = globalThis.fetch;
if (typeof origFetch === "function") {
  // LOCAL STUB, deliberately the ONLY exception to "no external fetch": Next's dev HMR client handshake asks
  // npm for its dist-tags (hot-reloader-shared-utils.js getVersionInfo). We answer THAT ONE exact request
  // from memory with a clearly synthetic body and never reach origFetch/DNS/sockets for it. Any other URL,
  // method, header or option falls through to the normal check (and a violation kills the process group).
  const STUB_URL = "https://registry.npmjs.org/-/package/next/dist-tags";
  const STUB_LOG = LOG + ".stub-uses";
  const isStubbedRequest = (input, init) => {
    const url = typeof input === "string" ? input : (input instanceof URL ? input.href : null);
    if (url !== STUB_URL) return false;
    if (init !== undefined && init !== null) {
      const keys = Object.keys(init);
      if (keys.length > 1 || (keys.length === 1 && !(keys[0] === "method" && String(init.method).toUpperCase() === "GET"))) return false;
    }
    return true;
  };
  globalThis.fetch = function guardedFetch(input, init) {
    if (isStubbedRequest(input, init)) {
      try { fs.appendFileSync(STUB_LOG, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, url: STUB_URL, note: "answered LOCALLY with a synthetic body; no network access" }) + "\n"); } catch {}
      // Next only reads { latest, canary }; equal to the installed 16.4.5 so staleness resolves to "fresh".
      // The extra field and header mark it as synthetic: this is NOT npm data.
      return Promise.resolve(new Response(JSON.stringify({ latest: "16.4.5", canary: "16.4.5", _synthetic: "tgfm-isolation-local-stub" }), { status: 200, headers: { "content-type": "application/json", "x-tgfm-synthetic": "1" } }));
    }
    const r = hostFromUrlLike(input);
    if (!r.local) checkHost("fetch", r.host);
    return origFetch.call(this, input, init);
  };
}
for (const name of ["WebSocket", "EventSource"]) {
  const Orig = globalThis[name];
  if (typeof Orig !== "function") continue;
  globalThis[name] = class GuardedSocket extends Orig {
    constructor(url, ...rest) {
      const r = hostFromUrlLike(url);
      if (!r.local) checkHost(name, r.host);
      super(url, ...rest);
    }
  };
}

// ------------------------------------------------------------- child_process
const cp = require("node:child_process");
function guardEnv(options) {
  const env = { ...(options && options.env ? options.env : process.env) };
  env.NODE_OPTIONS = (env.NODE_OPTIONS && env.NODE_OPTIONS.includes(GUARD_PATH) ? env.NODE_OPTIONS : `${env.NODE_OPTIONS || ""} --require ${JSON.stringify(GUARD_PATH)}`.trim());
  env.TGFM_GUARD_LOG = LOG;
  return env;
}
// Index of the options argument for (file, [args], [options], [cb]) style calls; -1 if absent.
function optionsIndex(args, argvAllowed) {
  const i = argvAllowed && Array.isArray(args[1]) ? 2 : 1;
  return args[i] && typeof args[i] === "object" && !Array.isArray(args[i]) ? i : -1;
}
function withGuardedEnv(args, argvAllowed) {
  const at = argvAllowed && Array.isArray(args[1]) ? 2 : 1;
  const i = optionsIndex(args, argvAllowed);
  if (i === -1) args.splice(at, 0, { env: guardEnv({}) });
  else args[i] = { ...args[i], env: guardEnv(args[i]) };
  return args;
}
function wrapSpawnLike(name, { viaShell = false } = {}) {
  const orig = cp[name];
  cp[name] = function guardedChildProcess(...args) {
    const file = args[0];
    const i = optionsIndex(args, !viaShell);
    const shellOpt = i !== -1 && args[i].shell;
    if (viaShell || shellOpt) {
      // exec/execSync (or shell:true) run the string through a shell: only a bare `node ...` command is allowed
      // (and no shell metacharacters that could chain another program)
      const cmd = String(file);
      if (!/^\s*("?)(node|\S*\/node)\1(\s|$)/.test(cmd) || /[`$]/.test(cmd) || /[;&|<>\n(){}]/.test(cmd.replace(/"[^"]*"|'[^']*'/g, ""))) violation(`child_process.${name}`, file);
    } else if (!isAllowedExecutable(file)) {
      violation(`child_process.${name}`, file);
    }
    return orig.apply(this, withGuardedEnv(args, !viaShell));
  };
}
for (const n of ["spawn", "spawnSync", "execFile", "execFileSync"]) wrapSpawnLike(n);
for (const n of ["exec", "execSync"]) wrapSpawnLike(n, { viaShell: true });
{
  const origFork = cp.fork;
  cp.fork = function guardedFork(modulePath, ...rest) {
    const idx = Array.isArray(rest[0]) ? 1 : 0;
    const opts = { ...(rest[idx] && typeof rest[idx] === "object" ? rest[idx] : {}) };
    opts.env = guardEnv(opts);
    if (opts.execPath && !isAllowedExecutable(opts.execPath)) violation("child_process.fork", opts.execPath);
    rest[idx] = opts;
    return origFork.call(this, modulePath, ...rest);
  };
}

module.exports = { isLoopbackHost, EXIT_CODE };
