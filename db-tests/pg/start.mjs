// Starts a DISPOSABLE local PostgreSQL (data dir in a temp folder) on 127.0.0.1 only and creates the empty database `tgfm_test`.
// Prints the connection URL to the file given as argv[2]; stays running until killed. Nothing here can reach another host.
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const out = process.argv[2];
const free = () => new Promise((res, rej) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); s.on("error", rej); });
const port = await free();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tgfm-pg-"));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "tgfm_test_user", password: "local-test-only", port, persistent: false, postgresFlags: ["-c", "listen_addresses=127.0.0.1"] });
await pg.initialise();
await pg.start();
await pg.createDatabase("tgfm_test");
const url = `postgresql://tgfm_test_user:local-test-only@127.0.0.1:${port}/tgfm_test`;
fs.writeFileSync(out, url);
console.log(`READY ${url.replace(/:[^:@]*@/, ":***@")} dir=${dir}`);
// Shutdown must leave nothing behind: the data directory can hold whatever the tests stored (order rows, payment links). postgres is asked to stop;
// if it does not within a few seconds it is stopped by the pid in its own pid file (TERM, then KILL); the directory is always removed.
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const stop = async () => {
  let pid = null;
  try { pid = Number(fs.readFileSync(path.join(dir, "postmaster.pid"), "utf8").split("\n")[0]); } catch {}
  try { await Promise.race([pg.stop(), new Promise((r) => setTimeout(r, 8000))]); } catch {}
  if (pid && alive(pid)) {
    try { process.kill(pid, "SIGTERM"); } catch {}
    for (let i = 0; i < 20 && alive(pid); i++) { if (i === 10) { try { process.kill(pid, "SIGKILL"); } catch {} } await new Promise((r) => setTimeout(r, 500)); }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGINT", stop); process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
