#!/usr/bin/env node
// Local stand-in for Google's Gemini "interactions" endpoint. Listens on 127.0.0.1 only; never contacts anything. It lets the
// mockup route be exercised for real (request building, retries, image handling, persistence) without spending Gemini credit.
//   node scripts/isolation/gemini-stub.mjs [port=3199]
// Control (loopback only):  POST /__mode {"mode":"ok|http500|http429|noimage|badimage|slow"}   GET /__stats   POST /__reset
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const sharp = require(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../node_modules/sharp"));

const port = Number(process.argv[2] ?? 3199);
let mode = "ok";
const stats = { calls: 0, rejectedNoKey: 0, lastBytes: 0, modes: [] };
// a square, garment-ish image: the route cuts its own crop out of whatever square comes back
const png = await sharp({ create: { width: 1280, height: 1280, channels: 3, background: { r: 236, g: 236, b: 240 } } }).png().toBuffer();
const b64 = png.toString("base64");

const readBody = (req) => new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))); });
const json = (res, status, obj) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && url.pathname === "/__mode") { mode = JSON.parse((await readBody(req)).toString()).mode; return json(res, 200, { mode }); }
  if (req.method === "POST" && url.pathname === "/__reset") { mode = "ok"; stats.calls = 0; stats.rejectedNoKey = 0; stats.modes = []; return json(res, 200, { ok: true }); }
  if (req.method === "GET" && url.pathname === "/__stats") return json(res, 200, { mode, ...stats });
  if (req.method === "POST" && url.pathname === "/v1beta/interactions") {
    const body = await readBody(req);
    if (!req.headers["x-goog-api-key"]) { stats.rejectedNoKey++; return json(res, 403, { error: { message: "API key missing" } }); }
    stats.calls++; stats.lastBytes = body.length; stats.modes.push(mode);
    if (mode === "http500") return json(res, 500, { error: { message: "stub: internal error" } });
    if (mode === "http429") return json(res, 429, { error: { message: "stub: quota exceeded" } });
    if (mode === "noimage") return json(res, 200, { steps: [{ content: [{ text: "I cannot draw that." }] }] });
    if (mode === "badimage") return json(res, 200, { output_image: { data: Buffer.from("this is not an image").toString("base64"), mime_type: "image/png" } });
    if (mode === "slow") await new Promise((r) => setTimeout(r, 3000));
    return json(res, 200, { output_image: { data: b64, mime_type: "image/png" } });
  }
  json(res, 404, { error: "stub: no such route" });
}).listen(port, "127.0.0.1", () => console.log(`gemini-stub listening on 127.0.0.1:${port}`));
