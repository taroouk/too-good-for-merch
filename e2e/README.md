# TGFM end-to-end tests (Playwright)

Separate package (`e2e/package.json`, its own lockfile) so the app's dependencies and lockfile are untouched.
Playwright **1.58.2** is pinned because 1.65 refuses to install Chromium on macOS 13.

## What they run against (never anything real)
* the **isolated app** (`scripts/isolation/run-isolated.mjs`: temporary copy of the working tree, scrubbed environment, network guard, macOS sandbox);
* a **real PostgreSQL** that exists only for the test run (`db-tests/pg/start.mjs`: disposable, 127.0.0.1 only, throw-away data dir);
* a **local Gemini stand-in** (`scripts/isolation/gemini-stub.mjs`): no Gemini credit is ever spent;
* Paymob is **not configured**, so "continue to payment" stops at the payment boundary before any request exists. The browser guard
  (`fixtures/guard.ts`) additionally fails any test that tries to reach a non-localhost host.

## Run
```bash
# 1. disposable local PostgreSQL (prints its URL into the given file) and an EMPTY database for the app
node db-tests/pg/start.mjs /tmp/pg.url &
# create the database (name must contain "test"), migrate it, then load the fixtures:
TEST_DATABASE_URL=<url of that empty database> node db-tests/reset-and-seed.mjs
# 2. local Gemini stand-in
node scripts/isolation/gemini-stub.mjs 3199 &
# 3. the app, isolated, on port 3101
node scripts/isolation/run-isolated.mjs --qa-routes --os-sandbox --port 3101 --env DATABASE_URL=<that url> \
  --env GEMINI_API_KEY=stub-key --env GEMINI_API_ENDPOINT=http://127.0.0.1:3199/v1beta/interactions \
  -- node node_modules/next/dist/bin/next dev -p 3101
# 4. the tests (desktop + phone viewport)
cd e2e && npm install && npx playwright install chromium
E2E_BASE_URL=http://localhost:3101 E2E_TEST_PASSWORD=<seeded test password> npx playwright test
```
**Production-mode run** (needed for anything where `next dev` and a production build differ, e.g. redacted server-action errors):
use `-- node scripts/isolation/prod-start.mjs 3102` as the command and run `tests/upload-validation.spec.ts` with `E2E_BASE_URL=http://localhost:3102`.

## Coverage map
| Area | Spec |
|---|---|
| Guest cannot use the designer or the Gemini API | gemini-access, security |
| Signup, login, logout, session persistence, duplicate address, open-redirect, password-reset pages | auth |
| Artwork upload (valid, invalid types, hostile SVGs, size and pixel limits, stored bytes) | upload-validation |
| Designer, Gemini (local stub), persistence/restoration, bag, wishlist, checkout to the payment boundary, orders, logout | journey |
| Gemini failure modes, ownership, request validation, concurrency | gemini-failures |
| IDOR, blocked users, brute force, information exposure, headers | security |
| Admin access control, every admin page, order visibility, CSV export, blocking, role demotion | admin |
| Public pages (render, overflow, images, 404, navigation) | pages |
| Webhook success/failure/duplicate/refund with local signing | webhooks |
| Paymob Sandbox | webhooks (skipped until the owner approves the payment-testing phase) |
| Admin catalog, prices, settings; every admin endpoint and Server Action as guest / customer / blocked / demoted admin; admin actions | admin-catalog, admin-api, admin-actions |
| Crop (valid, cancelled, forged requests), attach of an earlier upload, the "Place it at the instant the upload finishes" race | crop, attach-asset, place-race |
| Responsive (5 widths) with console/network error checks | responsive |
| QA routes are not exposed in a production build (see below) | qa-routes-exposure |

## Stability runs (no retries)
`E2E_RETRIES=0` (default is 1), `E2E_TRACE=on` (default retain-on-failure), `E2E_DIAG=1` always attaches `diagnostics.log` (console, page
errors, navigations, failed and 4xx/5xx requests). A test that needed a retry or the helper's second click (`helper-retry` annotation)
is NOT a clean pass.

## QA routes must not exist in production
`qa-routes-exposure.spec.ts` needs a production build started in one of two ways, and `E2E_QA_EXPOSURE=absent|disarmed`:
* `absent`: `run-isolated.mjs` WITHOUT `--qa-routes` (the routes are not in the build);
* `disarmed`: `--qa-routes-disarmed` (routes installed, `TGFM_FAKE_QA` unset: every route's own guard must answer 404).

## Paymob SANDBOX (test mode only)
`tests/paymob-sandbox.spec.ts` runs against a server started with `run-isolated.mjs --qa-routes --paymob-sandbox-env <env file> -- node scripts/isolation/prod-start.mjs <port>` (no `--os-sandbox`),
plus `E2E_PAYMOB_SANDBOX=1`, `E2E_PAYMOB_HMAC`, `E2E_PAYMOB_INTEGRATION` in the environment. The runner refuses unless both keys are TEST keys, passes only the secret key, public key, integration id and HMAC secret
(never the legacy API key) and lets the network guard reach exactly `accept.paymob.com`. Each run creates real Paymob TEST intentions (no card, no money). No card is ever entered by a test; callbacks are signed locally with the configured HMAC secret.

**Sandbox safety gate:** `e2e/global-setup.ts` refuses to run anything against a server that holds Paymob TEST keys unless the run sets `E2E_PAYMOB_SANDBOX=1`
(which switches traces off in `playwright.config.ts`: a trace stores checkout URLs in full), and refuses a server that looks LIVE outright. Use `e2e/scripts/scan-artifacts.cjs <env file> <paths…>`
to scan reports, traces (zips are opened) and diffs for the secret VALUES; it prints names and files only.
