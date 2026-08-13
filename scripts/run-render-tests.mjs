#!/usr/bin/env node
// file: scripts/run-render-tests.mjs
//
// Bespoke test runner for src/studio/render/__tests__/*.test.ts. This repo
// has no Jest/Vitest configured, so this compiles the render module +
// tests with plain tsc into a temp directory and runs the result with
// plain node. See scripts/render-test.tsconfig.json for the compile config.
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptsDir, "..");
const buildDir = path.join(repoRoot, ".render-test-build");
const testsDir = path.join(buildDir, "__tests__");

function compile() {
  rmSync(buildDir, { recursive: true, force: true });
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsc", "-p", path.join(scriptsDir, "render-test.tsconfig.json")],
    { cwd: scriptsDir, stdio: "inherit" },
  );
}

async function run() {
  try {
    compile();
  } catch {
    console.error("\nrender-tests: TypeScript compilation failed (see above).");
    process.exitCode = 1;
    return;
  }

  const testFiles = readdirSync(testsDir)
    .filter((f) => f.endsWith(".test.js"))
    .sort();

  if (!testFiles.length) {
    console.error("render-tests: no compiled test files found.");
    process.exitCode = 1;
    return;
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of testFiles) {
    const modulePath = pathToFileURL(path.join(testsDir, file)).href;
    const mod = await import(modulePath);
    if (typeof mod.runAll !== "function") {
      console.error(`render-tests: ${file} does not export runAll().`);
      totalFailed += 1;
      continue;
    }
    const { passed, failed } = await mod.runAll();
    totalPassed += passed;
    totalFailed += failed;
  }

  console.log(`\n${totalPassed} passed, ${totalFailed} failed`);
  process.exitCode = totalFailed > 0 ? 1 : 0;
}

await run();
