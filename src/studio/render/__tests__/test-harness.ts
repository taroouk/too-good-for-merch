// file: src/studio/render/__tests__/test-harness.ts
//
// Minimal, dependency-free test harness for the render module. This repo
// has no Jest/Vitest configured; scripts/run-render-tests.mjs compiles this
// subtree with plain tsc and runs the result with plain node, so the
// harness intentionally avoids any test-framework dependency.
export type TestFn = () => void | Promise<void>;

export async function runSuite(
  suiteName: string,
  tests: Record<string, TestFn>,
): Promise<{ suiteName: string; passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  console.log(`\n${suiteName}`);
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      passed += 1;
      console.log(`  ok   - ${name}`);
    } catch (err) {
      failed += 1;
      console.log(`  FAIL - ${name}`);
      console.log(`         ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { suiteName, passed, failed };
}
