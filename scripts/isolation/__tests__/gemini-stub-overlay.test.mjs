// The test-copy variant of gemini-endpoint.ts (qa/overlay-gemini-stub) honours a loopback GEMINI_API_ENDPOINT even in production, nothing else;
// the repository's own file must still ignore the override in production.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
async function load(rel) {
  const out = ts.transpileModule(fs.readFileSync(path.join(root, rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(out).toString("base64")}`);
}
const stub = "http://127.0.0.1:3199/v1beta/interactions";

test("overlay: loopback override honoured in production, anything else is Google's address", async () => {
  const m = await load("scripts/isolation/qa/overlay-gemini-stub/src/lib/mockups/gemini-endpoint.ts");
  assert.equal(m.resolveGeminiEndpoint({ NODE_ENV: "production", GEMINI_API_ENDPOINT: stub }), stub);
  assert.equal(m.resolveGeminiEndpoint({ NODE_ENV: "production", GEMINI_API_ENDPOINT: "https://evil.example/x" }), m.GOOGLE_GEMINI_INTERACTIONS_ENDPOINT);
  assert.equal(m.resolveGeminiEndpoint({ NODE_ENV: "production" }), m.GOOGLE_GEMINI_INTERACTIONS_ENDPOINT);
});

test("the repository file still ignores the override in production", async () => {
  const m = await load("src/lib/mockups/gemini-endpoint.ts");
  assert.equal(m.resolveGeminiEndpoint({ NODE_ENV: "production", GEMINI_API_ENDPOINT: stub }), m.GOOGLE_GEMINI_INTERACTIONS_ENDPOINT);
});
