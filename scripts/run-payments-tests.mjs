#!/usr/bin/env node
// file: scripts/run-payments-tests.mjs
//
// Bespoke test runner for pricing/payment unit tests
// (src/pricing/__tests__, src/lib/payments/__tests__). This repo has no
// Jest/Vitest configured, so this compiles the pricing + payments modules
// with plain tsc into a temp directory and runs the result with plain
// node. Mirrors scripts/run-render-tests.mjs.
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptsDir, "..");
const buildDir = path.join(repoRoot, ".payments-test-build");

function compile() {
  rmSync(buildDir, { recursive: true, force: true });
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsc", "-p", path.join(scriptsDir, "payments-test.tsconfig.json")],
    { cwd: scriptsDir, stdio: "inherit" },
  );
}

function findTestFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    if (statSync(entryPath).isDirectory()) {
      found.push(...findTestFiles(entryPath));
    } else if (entry.endsWith(".test.js")) {
      found.push(entryPath);
    }
  }
  return found.sort();
}

async function run() {
  try {
    compile();
  } catch {
    console.error("\npayments-tests: TypeScript compilation failed (see above).");
    process.exitCode = 1;
    return;
  }

  const testFiles = findTestFiles(buildDir);

  if (!testFiles.length) {
    console.error("payments-tests: no compiled test files found.");
    process.exitCode = 1;
    return;
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of testFiles) {
    const modulePath = pathToFileURL(file).href;
    const mod = await import(modulePath);
    if (typeof mod.runAll !== "function") {
      console.error(`payments-tests: ${path.relative(buildDir, file)} does not export runAll().`);
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
