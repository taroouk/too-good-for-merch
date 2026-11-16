// Scans test artefacts (reports, traces, logs, diffs) for the VALUES of the Paymob secrets in an env file, without ever printing them.
// Usage: node e2e/scripts/scan-artifacts.cjs <env file> <dir-or-file>...    Exit 1 if any value is found (only the setting NAME and the file are printed).
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { inflateRawSync } = require("node:zlib");

function secretValues(envFile) {
  const out = [];
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*(PAYMOB_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (v.length >= 8 && /KEY|SECRET|HMAC|INTEGRATION|IFRAME/.test(m[1])) out.push([m[1], v]);
  }
  return out;
}

// Also finds a value inside a zip (trace.zip is stored compressed, so the entries are inflated before searching).
async function scan(secrets, roots) {
  const hits = [];
  let files = 0;
  const check = (name, buf) => { const t = buf.toString("latin1"); for (const [k, v] of secrets) if (t.includes(v)) hits.push(`${k} in ${name}`); };
  const zipEntries = (buf) => { // minimal zip reader (central directory) good enough for Playwright traces
    const out = []; let i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); if (i < 0) return out;
    const count = buf.readUInt16LE(i + 10); let p = buf.readUInt32LE(i + 16);
    for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
      const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
      const name = buf.toString("utf8", p + 46, p + 46 + nlen); const lh = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      const data = buf.subarray(lh, lh + csize); try { out.push([name, method === 8 ? inflateRawSync(data) : data]); } catch {}
      p += 46 + nlen + elen + clen;
    }
    return out;
  };
  let unreadable = 0;
  const visit = (p) => {
    let st;
    try { st = fs.lstatSync(p); } catch { unreadable++; return; } // lstat: a symlink is never followed
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) { let names = []; try { names = fs.readdirSync(p); } catch { unreadable++; } for (const e of names) if (e !== "node_modules") visit(path.join(p, e)); return; }
    if (!st.isFile() || st.size > 400e6) return; // sockets, pipes, devices, huge files
    let buf; try { buf = fs.readFileSync(p); } catch { unreadable++; return; }
    files++; check(p, buf);
    if (p.endsWith(".zip")) for (const [n, b] of zipEntries(buf)) check(`${p}!${n}`, b);
  };
  for (const r of roots) visit(r);
  return { hits, files, unreadable };
}

module.exports = { secretValues, scan };

if (require.main === module) {
  (async () => {
    const [envFile, ...roots] = process.argv.slice(2);
    const secrets = secretValues(envFile);
    const { hits, files, unreadable } = await scan(secrets, roots);
    console.log(`scanned ${files} files (${unreadable} unreadable, skipped) for ${secrets.length} secret values: ${hits.length} hit(s)`);
    for (const h of hits) console.log("  LEAK:", h);
    process.exit(hits.length ? 1 : 0);
  })();
}
