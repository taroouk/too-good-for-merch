import { defineConfig, devices } from "@playwright/test";

// The tests run against the ISOLATED fake-database server (never a real database, never Paymob, never Gemini):
//   node scripts/isolation/run-isolated.mjs --fake-prisma --qa-routes --os-sandbox --port 3100 \
//     --env AI_MOCKUP_DAILY_LIMIT_PER_USER=3 --env AI_MOCKUP_DAILY_LIMIT_GLOBAL=5 -- node node_modules/next/dev... (see e2e/README.md)
// Browser traffic is not covered by the Node network guard, so every non-localhost request is aborted below (see fixtures/guard.ts).
export default defineConfig({
  globalSetup: "./global-setup.ts",
  testDir: "./tests",
  timeout: 60_000,
  // One retry: the development server compiles each route on first use, which occasionally makes a first interaction miss. A test that
  // needs the retry is reported as "flaky", never as a clean pass.
  retries: Number(process.env.E2E_RETRIES ?? 1),
  workers: 1, // the isolated server is rate limited per IP and shares one in-memory database
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    // A Paymob sandbox run never records traces (they would hold checkout URLs with the client secret and public key); see global-setup.ts.
    trace: process.env.E2E_PAYMOB_SANDBOX === "1" ? "off" : ((process.env.E2E_TRACE as "on" | "off" | "retain-on-failure" | undefined) ?? "retain-on-failure"),
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
