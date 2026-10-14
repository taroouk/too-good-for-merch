# Too Good For Merch — Full Test Report

Dates: 2026-10-10 / 2026-10-11 · Branch: `Production` · Next 16.4.0 · Prisma 5.22 · Node 24

## 1. Summary

| Area | Result |
|---|---|
| Static checks (typecheck, lint, build) | Pass (0 errors, 14 lint warnings) |
| Unit tests | 529/529 pass (322 render + 207 payments) |
| Dependency security | 8 advisories found (2 critical) → **fixed, 0 remaining** |
| HTTP end-to-end (auth, roles, pricing, projects, isolation) | 55/57 pass; the 2 "failures" are intentional redirects |
| Payment flow (Paymob **test mode**) | 18/18 pass |
| Browser UI (login, builder, upload, AI mockup, wishlist, bespoke, checkout) | Pass, with the issues below |
| Mobile layout (375px) | No horizontal overflow on 5 pages checked |

**Verdict: nothing is broken in the code paths tested, but it is not "100% verified".** There is one probable real bug (Section 5, #1), one unexplained UI issue (#2), and a few untested areas (Section 6).

All write tests ran against a throw-away local Postgres (since stopped). The live Neon database was only touched by two early read/health probes and one unsigned webhook probe (one `WebhookEvent` row, see #8).

## 2. Changes made (uncommitted)

- Upgraded `next` 16.2.6 → 16.4.0, `next-auth` 4.24.14 → 4.24.15, `sharp` 0.34.5 → 0.35.5. `npm audit --omit=dev`: 0 vulnerabilities.
- `sharp` 0.35 removed the `sharp.Metadata`-style namespace types; updated imports in `app/api/mockups/nanobanana/route.ts`, `src/studio/render/fabric-shading.ts`, `src/studio/render/engines/sharp-renderer.ts`.
- Removed an unused `Image` import in `app/(marketing)/page.tsx`.
- Added `docs/TEST_REPORT.md` (Arabic) and this file. Nothing was committed.

## 3. Automated checks

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | 0 errors, 14 warnings (mostly `<img>` vs `next/image`; `_garmentColor` unused param is intentional) |
| `npm run test:render` | 322 passed, 0 failed |
| `npm run test:payments` | 207 passed, 0 failed |
| `prisma validate` / `migrate status` | Valid; 21 migrations applied |
| `next build` | Pass |
| `npm run check:prod` | **Fails locally**: `NEXTAUTH_URL` must be https and not localhost (expected for local `.env`) |

## 4. End-to-end results

**Auth and roles**: register (success, duplicate, short password, bad email), login/logout, wrong password rejected, USER vs ADMIN roles, `/admin` blocked for guests and users, all 8 admin pages and order export work for admins.

**Pricing**: valid quotes (FITTED/OVERSIZED, tiers), custom/bulk modes, invalid product, quantity 0 and 100000 rejected.

**Projects and isolation**: users and guests can create projects; owners read their own build; other users and guests get 401/403/404 on builds, Studio pages, mockup/asset/artwork files.

**Payments (Paymob test keys, `egy_*_test`)**:
- Invalid customer/method/address rejected; guests get 401.
- Valid request creates a real Paymob test order and a PENDING order row (EGP 802.00 = USD 16.04 × 50).
- Webhook: valid HMAC with wrong amount does not mark PAID; forged HMAC → 401; failed transaction → FAILED; valid success → PAID; replay is idempotent.
- Owner can open the order, other users cannot; admin order detail, payments page and CSV export include the order.
- Checkout fails closed (503) when the USD→EGP rate is not configured.

**Browser**: login → Studio; artwork upload shows on the canvas; Save generated a print mockup and then a Gemini AI mockup (~25 s, succeeded); wishlist add/list works; bespoke request validated empty fields, submitted, showed confirmation and appeared in the admin bespoke list. No console errors from the app itself.

**Notifications**: email is skipped cleanly when `RESEND_API_KEY` is unset (logged); WhatsApp is env-gated the same way. Real delivery was not tested.

## 5. Issues found

| # | Severity | Issue | Details / suggested fix |
|---|---|---|---|
| 1 | **Medium–High (needs confirmation on prod)** | Builder defaults are not persisted | A new project shows FITTED / WHITE / 170GSM (`BuilderClient.tsx:292-294`) but the `BuildDraft` stays `NULL` until the user edits something. Clicking **Add to Bag** immediately led to a checkout page showing "Select product and fabric" with no price. After choosing OVERSIZED only `product` was saved; `color` and `fabric` stayed NULL. Fix: persist defaults on first load, or send the full selection when opening checkout. |
| 2 | Medium (cause unknown) | "Pricing unavailable" in Builder after switching to OVERSIZED | `/api/pricing/quote` returned 200 with price 8.40 for the same inputs. Likely client state vs saved draft mismatch; needs debugging alongside #1. |
| 3 | Medium | `check:prod` fails with the local `NEXTAUTH_URL` | Ensure production env uses the https domain. |
| 4 | Low–Medium | Stale session for a deleted user breaks `/studio/start` | A valid JWT whose user row no longer exists causes an unhandled FK error (P2003) and a blank page. Seen after I reset the test DB; could happen if an admin deletes a user. Handle by clearing the session or redirecting to login. |
| 5 | Low–Medium | Fresh databases have no `PricingRule` rows | Only hard-coded fallback prices exist; FITTED/HEAVYWEIGHT_300 has no price ("No pricing found"). Confirm production has pricing rules and an FX rate set. |
| 6 | Low | Server log prints the full Gemini response body | `[Nano Banana] Gemini response body: …` can be noisy and may be large; consider logging status/usage only. |
| 7 | Low | `/api/payments/webhook` is just a re-export of `/api/payments/paymob/webhook` | Confirm which URL is registered in the Paymob dashboard. |
| 8 | Info | Probe side effect | One unsigned test request created one `WebhookEvent` row in the live DB (the handler records every request). |
| 9 | Info | Prisma 5.22 is two majors behind; `next start` warns it does not work with `output: standalone` | Plan an upgrade; use `node .next/standalone/server.js` in production if standalone is intended. |

## 6. Not tested

- Real card payment completion in the Paymob iframe (webhook was simulated with a correctly signed payload).
- Real email (Resend) and WhatsApp (Meta Graph API) delivery — keys are unset.
- Wallet payments (disabled in config).
- Canvas drag/rotate/scale interactions, multi-placement and back-side designs, 3D try-on.
- Admin write actions (pricing edits, bespoke quoting, order status changes, user blocking) via the UI.
- Cross-browser and real-device testing (only an emulated 375px viewport in one browser).
- Load and performance testing; production deployment (Vercel) configuration.
- No automated E2E suite exists in the repo; the scripts used here were temporary and were removed.

## 7. Recommended next steps

1. Fix #1 and #2 (persist builder defaults; re-check the price display), then add a regression test.
2. Verify production env: https `NEXTAUTH_URL`, pricing rules, USD→EGP rate, Paymob webhook URL.
3. Handle the deleted-user session case (#4).
4. Run the upgraded dependencies through a staging smoke test before deploying.
5. Add Playwright E2E tests against a disposable database for the checkout, bespoke and admin flows.

## 8. Round 2 — admin actions, canvas, bespoke-to-payment (2026-10-11)

Same isolated local Postgres (stopped afterwards); Paymob test mode.

**Passed**
- Admin: login redirect, Settings (FX rate change; it asks `window.confirm`, saved after confirming; audit log written), Pricing (create rule → quote API changes immediately; delete rule), Orders (internal note; status → CANCELLED), Customers (block → user can no longer log in; unblock), Bespoke (quote $40 → request becomes QUOTED).
- Quoted bespoke → customer build shows $40 → payment intent created: $40 × rate 55 = EGP 2,200 (the new rate was applied).
- Builder: upload, drag (works), zoom slider (clamped 0.4–1.65), placement switch (front/back), second artwork on back, layers survive reload, front/back preview carousel, colour (black), quantity, size, price update ($8.02 → $16.04 for qty 2).
- Misc routes: order page / success / failed redirect logic, `/payments/*` redirect to `/orders`, `/portfolio` redirect, static assets 200.

**New issues**
| # | Severity | Issue |
|---|---|---|
| 10 | Medium | A valid signed Paymob success webhook marks a **CANCELLED** order as `payment = PAID` (order status stays CANCELLED), and the customer's `/orders/<id>/success` page then renders. The payment link of a cancelled order remains usable. Money is recorded, but no refund/alert/flag for the admin. Decide the policy (block, auto-refund flag, or alert). |
| 11 | Low | Admin pricing accepts overlapping rules (e.g. FITTED/HEAVYWEIGHT_300 qty 1–10 and 5–15). The engine resolves it deterministically (highest `minQty` wins) but nothing warns the admin. |
| 12 | Low | Admin bespoke/order status actions throw a raw `Error` ("This status transition is not allowed.") → 500 error page when the page is stale or double-submitted, instead of a friendly message. |
| 13 | Low | Submitting `/bespoke/new` for a build whose product is not CUSTOM silently stays on the form with no visible error (seen once; the working path is Builder → Bespoke → "Continue with custom request"). |
| 14 | Low | No `robots.txt` or `sitemap.xml` (404). |

**Still not tested**: real card entry in the Paymob iframe, real email/WhatsApp delivery, rotate (no rotate control found in the builder UI), other browsers/real devices, load testing. The `public/assets/3d/oversized-tshirt.glb` is not referenced by the builder preview (the "TryOn3D" preview is a model-photo overlay), so no real 3D rendering was exercised.

## 9. Round 3 — security, uploads, concurrency, load, accessibility (2026-10-11)

Same isolated local Postgres (stopped afterwards).

**Passed**
- Headers: CSP, X-Frame-Options, nosniff, Referrer-Policy present; no `x-powered-by`. CSP `connect-src` blocked a cross-origin fetch from the page (good).
- Input hardening: malformed JSON → 400; SQL/XSS-looking emails no 5xx; overlong email/password rejected; `role: "ADMIN"` in the register body ignored; email uniqueness is case-insensitive; quote endpoint survived 7 fuzz payloads (null, array, string/float/negative qty, bad placements, `__proto__`); webhook rejects 2 MB bodies, invalid JSON, bad HMAC, GET.
- Auth: login without CSRF token fails; brute force (14 bad passwords) locks the correct password out; register rate limit returns 429; deleted-user etc. see earlier sections.
- Uploads: PDF, text-as-PNG, JPG-with-EXE-bytes, SVG with `<script>`, SVG with DOCTYPE/entities were all rejected server-side and nothing was stored.
- Concurrency: 5 simultaneous checkouts for the same build → 1 order (4× 409); 8 simultaneous identical webhooks → 1 recorded event, 7 flagged duplicate, order PAID once.
- Load (local, prod build, single process): `/`, `/login`, `/contact`, health endpoints 300–480 req/s, p95 ≤ 200 ms, 0 errors; static video range requests fine.

**New issues**
| # | Severity | Issue |
|---|---|---|
| 15 | Medium | **Image-dimension DoS.** A 2 MB PNG at 10000×10000 is accepted (no pixel/dimension cap in app code, only sharp's 268 MP default). Generating the print mockup from it took 9.6 s and pushed the server from ~213 MB to ~919 MB RSS. A 16000×16000 image (0.8 MB file) decodes to ~1 GB. A few such requests could exhaust a serverless function's memory. Needs login; the print route has a rate limit. |
| 16 | Medium | **Account creation accepts non-string values.** `{"email":["a@b.co"],"password":{}}` created an account whose password is the literal string `[object Object]` (login succeeded with it). Validate `typeof === "string"`. |
| 17 | Medium (design) | **No email verification.** Anyone can register any email address, including someone else's, and set its password. Confirm whether this is acceptable for the shop. |
| 18 | Low–Medium | **Upload errors are unreadable in production.** For rejected SVG/fake-image uploads the UI shows "Minified React error #441" because server-action errors are masked; only the client-side check (PDF) shows a readable message. |
| 19 | Low | **Hero videos are heavy:** `hero.mp4` 20.4 MB and `hero-mobile.mp4` 21.8 MB (the mobile file is *larger*), `preload="auto"`; several images are 2–2.6 MB. Slow first load on mobile data. |
| 20 | Low | SEO/accessibility on the home page: no `<h1>`, no canonical, no Open Graph tags, meta description is just "Studio", no skip-link, no `robots.txt`/`sitemap.xml`. (All images have `alt`; buttons/links have names; `lang="en"`.) |
| 21 | Low | `/api/pricing/quote` uses an in-memory rate limiter, so its limit is per server instance, not shared on serverless. |

**Notes**: rate-limit state lives in the DB (`RateLimitBucket`), so tests had to clear it between batches. A pre-existing `git stash` (`stash@{0}: On main: up`) exists in the repo; it is not from this testing.

**Still not tested**: real card entry in the Paymob iframe; real email/WhatsApp delivery; other browsers/real devices; sustained or multi-instance load; production infrastructure (Vercel limits, Neon pooling).

## 10. Round 4 — exports, DB outage, payment retry (2026-10-11)

Same isolated local Postgres and Paymob **test** keys.

**Passed**
- CSV export neutralises formula injection (values starting with `=`, `+`, `-`, `@` are prefixed with `'`); correct content type and filename; all quotes escaped.
- Database outage (Postgres stopped while the server ran): static/marketing pages kept serving, `/api/health/ready` returned 503 with `database: "error"`, pricing quote fell back to built-in prices, register returned a clean 500, the Paymob webhook returned 500 (so Paymob will redeliver). After Postgres came back the app recovered without a restart.

**New issues**
| # | Severity | Issue |
|---|---|---|
| 22 | **High (payments recovery)** | **Retrying payment for an existing order fails.** `createPaymobPayment` always sends `merchant_order_id = order.orderNumber`; Paymob answers `422 {"message":"duplicate"}` on the second `create_order`. Result: admin **Generate retry link** shows the generic error page, and the customer's retry (`create-intent` with `orderId`) returns 502 "We couldn't start your payment". After a failed/abandoned payment neither side can re-pay the same order (a brand-new checkout is needed). Reproduced against Paymob test mode; needs confirmation against the live account but the call is identical. Fix idea: use a per-attempt merchant order id (e.g. `orderNumber-attemptN`) and map it back in the webhook, or reuse the existing Paymob order. |
| 23 | Medium | **Currency mismatch can block retries.** `resolveCurrentCurrency()` prefers the `StoreSetting.currency` row (schema default `USD`) over the payment currency (EGP). A `StoreSetting` row with `currency = USD` makes every retry answer 409 "payment configuration is outdated" even though first-time checkout charges EGP. Make sure the Settings row stores `EGP`, or derive the payment currency in one place. |
| 24 | Low | Admin action failures (e.g. #22) show "Something went wrong … Minified React error #441" instead of the real message, same masking as #18. |

**Not testable by me / still open**: entering a card in Paymob's hosted iframe (third-party page, not allowed for me — please run one Paymob test-card payment yourself); real email/WhatsApp delivery (keys unset); Safari/Firefox/real devices (only the built-in Chromium was available).

## 11. Fixes applied (2026-10-11, uncommitted)

All verified by typecheck, lint (0 errors), 322 render + 218 payments unit tests, a fresh production build and a 36-check end-to-end regression on the isolated DB (Paymob test mode).

| Issue | Fix | Files |
|---|---|---|
| #22 payment retry fails (`422 duplicate`) | First attempt unchanged; only when Paymob answers `duplicate` on `create_order`, retry once with `orderNumber-R<nonce>`. Webhook maps the suffixed `merchant_order_id` back to the order. Verified: retry returns a payment URL, new Paymob order id, and a signed webhook with the suffixed id marks the order PAID. 6 new unit tests. | `src/lib/payments/paymob.ts`, `app/api/payments/paymob/webhook/route.ts`, `src/lib/payments/__tests__/paymob-retry.test.ts` |
| #1/#2 Builder defaults not saved / "Pricing unavailable" | Builder persists the on-screen defaults once on mount when the draft has NULL product/colour/fabric. Verified: draft saved as FITTED/WHITE/ESSENTIALS_170; switching to Oversized shows $8.40; Add to Bag shows the full order summary (EGP 420). | `src/studio/ui/BuilderClient.tsx` |
| #16 non-string register values | `email`/`password` must be strings, otherwise 400. | `app/api/auth/register/route.ts` |
| #15 image-dimension memory DoS | Raster uploads over 8000 px per side or 36 MP are refused (header-only read; SVG unchanged). Verified: 10000x10000 rejected, 1200x900 accepted. 5 new unit tests. | `src/lib/artwork-limits.ts`, `src/lib/storage.ts`, `scripts/payments-test.tsconfig.json`, test |
| #4 deleted/blocked user session breaks `/studio/start` | Both project-start routes now use `getUserId()` (re-checks the user row). | `app/studio/start/route.ts`, `app/api/create-and-open-project/route.ts` |
| #20 SEO | Real meta description + Open Graph title/description, `robots.txt` (disallows admin/api/studio/checkout/orders/wishlist/payments), `sitemap.xml` (home, contact). Base URL from `NEXT_PUBLIC_APP_URL`/`NEXTAUTH_URL`. | `app/layout.tsx`, `app/robots.ts`, `app/sitemap.ts` |
| #6 Gemini body logged in full | Logged body truncated to 600 chars. | `app/api/mockups/nanobanana/route.ts` |

Earlier in this session: dependency upgrade (`next` 16.4.0, `next-auth` 4.24.15, `sharp` 0.35.5) and the `sharp` type-import changes (Section 2).

**Deliberately NOT changed (need your decision or are config/asset work)**
- Cancelled order can still be paid (#10): choose policy (block payment link / flag for refund / alert admin).
- No email verification (#17).
- Overlapping pricing rules accepted (#11): rejecting them is a behaviour change for admins.
- Store currency row vs payment currency (#23): ensure Settings stores `EGP`; no code change made.
- `NEXTAUTH_URL` must be https in production (`check:prod`): environment setting, not code.
- Masked server-action errors in production ("Minified React error #441") (#18/#24): needs returning error objects from several actions and touching their callers; left as is to avoid regressions.
- Hero videos (20 MB each; mobile file larger than desktop) (#19): needs re-encoding (no `ffmpeg` here).
- In-memory rate limiter on `/api/pricing/quote` (#21), missing `<h1>` on home page (design), real card entry in Paymob iframe, real email/WhatsApp delivery.
