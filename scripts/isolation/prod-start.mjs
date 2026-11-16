// Builds the app and starts it in PRODUCTION mode (next start) inside an isolated copy: use as the command after `--` in run-isolated.mjs.
// Production mode behaves differently from `next dev` in ways that matter (e.g. server-action error messages are redacted).
//   node scripts/isolation/run-isolated.mjs --qa-routes --os-sandbox --port 3102 --env DATABASE_URL=<local test db> -- node scripts/isolation/prod-start.mjs 3102
import { spawn, spawnSync } from "node:child_process";
const port = process.argv[2] ?? "3102";
const next = ["node_modules/next/dist/bin/next"];
const build = spawnSync(process.execPath, [...next, "build"], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
if (build.status !== 0) process.exit(build.status ?? 1);
const server = spawn(process.execPath, [...next, "start", "-p", port], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
server.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
