// file: src/actions/__tests__/admin-guard.test.ts
// Static guard: every function a "use server" admin file exports is a public HTTP endpoint (a crafted request can call it even when no
// page does), so each one must authorise the caller FIRST -- before it reads the form or touches the database.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runSuite } from "../../testing/test-harness";

const dir = path.resolve(__dirname, "../../../src/actions");

export async function runAll() {
  const files = fs.readdirSync(dir).filter((f) => /^admin-.*\.ts$/.test(f));
  const tests: Record<string, () => void> = {
    "there are admin action files to check"() {
      assert.ok(files.length >= 8, `found ${files.length}`);
    },
  };
  for (const file of files) {
    tests[`${file}: every exported action calls requireAdmin() before anything else`] = () => {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      assert.ok(/^"use server";/m.test(source), "is a use-server file");
      const exports = [...source.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\s*\n([\s\S]*?)\n/g)];
      assert.ok(exports.length > 0, "exports at least one action");
      for (const match of exports) {
        assert.match(match[2], /requireAdmin\(|requireAdminOrRedirect\(/, `${match[1]} must start by authorising the admin (first statement: ${match[2].trim()})`);
      }
    };
  }
  return runSuite("actions/admin-guard", tests);
}
