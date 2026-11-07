# TGFM Studio — QA environment & browser test plan

Status: **Phase 2 (browser QA) has NOT been executed.** No isolated test database or sandbox credentials exist yet. Every test below is `BLOCKED`. Nothing here is a claim that a browser test passed.

## 1. Environment variables

Names only; values are never recorded here. "Now" = what the current checkout has (`.env` / `.env.local`), checked by name and emptiness only.

| Area | Variable | Needed for | Now | Test-environment value |
|---|---|---|---|---|
| Database | `DATABASE_URL` | everything | set in `.env` (a Neon host — **assume production**) | **a separate database only** (see §2) |
| NextAuth | `NEXTAUTH_URL` | login | set in `.env` | `http://localhost:3000` |
| NextAuth | `NEXTAUTH_SECRET` | login | set in `.env` | a new random value for the test env |
| Admin | `ADMIN_EMAILS`, `ADMIN_SEED_USERS`, `ADMIN_SEED_PASSWORD` | admin login, `db:seed:admins` | `ADMIN_EMAILS` set; seed vars missing | test-only admin e-mail/password |
| App URL | `NEXT_PUBLIC_APP_URL` | links in e-mails, Paymob return | set in `.env.local` | `http://localhost:3000` |
| Paymob | `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET` | card payment | set in `.env.local` (**test or live is unknown**) | Paymob **test-mode** keys only; the code always calls `accept.paymob.com`, so test vs live is decided purely by the keys |
| Paymob | `PAYMOB_WALLET_INTEGRATION_ID` | wallet option (hidden when unset) | missing | leave unset |
| Paymob | `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_CURRENCY` | present in `.env.local`, **not read by the code** | set | not needed |
| Gemini | `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL` | AI mockup | set | a separate key with a spend cap, or leave unset to test the failure path |
| WhatsApp (public) | `NEXT_PUBLIC_WHATSAPP_PHONE` | all WhatsApp links, Bespoke quote | **missing** (no fallback any more) | a test number for the "configured" run; unset for the "missing" run |
| WhatsApp (public) | `NEXT_PUBLIC_WHATSAPP_MESSAGE` | default message | missing (optional) | optional |
| WhatsApp (server) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_NOTIFY_TO` | order/bespoke notifications | missing | leave unset |
| E-mail | `RESEND_API_KEY`, `BESPOKE_NOTIFY_EMAIL` | notifications | missing | leave unset (sending is skipped/logged) |
| E-mail | `EMAIL_FROM` | sender | set in `.env.local` | any test address |
| Store | `STORE_CURRENCY` | fallback currency | missing (optional) | `EGP` |
| Other public | `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_INSTAGRAM_URL`, `NEXT_PUBLIC_TIKTOK_URL` | footer links | missing (defaults exist) | optional |
| Rendering | `RENDER_ENGINE` | renderer choice | missing (optional) | default |

Findings that matter for safety:
1. `.env` holds the only `DATABASE_URL` and it points at a hosted Neon database. Treat it as production.
2. `.env.local` holds Paymob credentials that may be **live**. Next.js loads `.env.local` over `.env`, so a plain `npm run dev` here would use them.
3. Neither file may be edited for QA. Use a separate checkout/folder with its own env files (below).

## 2. Setting up an isolated test environment

1. **Database** (pick one; confirm isolation before any migration):
   - Neon: create a new *project* (or a branch of a dummy project holding no customer data) and copy its connection string; or
   - local: `brew install postgresql@16`, `createdb tgfm_qa`, `DATABASE_URL=postgresql://localhost:5432/tgfm_qa`.
   - Isolation check: the host/database name in the new URL differs from the one in `.env`, and `npx prisma migrate status` against it shows an **empty** database before you migrate.
2. Make a separate working copy for QA (e.g. `git worktree add ../tgfm-qa` or copy the folder with the same uncommitted changes) and create its own `.env.local` (this file overrides `.env`). Do **not** copy the production `.env`/`.env.local`.
3. Put in that `.env.local`: the test `DATABASE_URL`, `NEXTAUTH_URL=http://localhost:3000`, a fresh `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, Paymob **test** keys, admin seed values, and (optionally) a capped Gemini key. Leave `RESEND_*` and `WHATSAPP_TOKEN/PHONE_ID/NOTIFY_TO` unset.
4. In the QA copy only: `npx prisma migrate deploy`, then `npm run db:seed:admins`.
5. In the admin settings of the QA app set a USD→EGP exchange rate (without one, prices stay in USD and checkout refuses to charge).
6. Create two test customer accounts and have a few sample images ready: a normal PNG, a transparent PNG, a very tall PNG, a wide PNG, an SVG, a >10 MB file and a corrupt `.png`.
7. Start with the project's `tgfm-dev` launch configuration from the QA copy, and run the WhatsApp tests twice: once with `NEXT_PUBLIC_WHATSAPP_PHONE` set and once unset (restart the server between runs — it is a build-time public variable).

Paymob rule: only the sandbox cards from Paymob's own test documentation; if the keys cannot be confirmed as test-mode, skip the payment tests.

## 3. Browser test matrix (all BLOCKED until §2 is done)

| # | Area | Steps | Expected | Result |
|---|---|---|---|---|
| Q1 | Rapid size switching (1.1) | Open Studio, click S/M/L/XL quickly 20 times | Price never shows "Calculating…"; buttons always clickable; price unchanged between sizes | BLOCKED |
| Q2 | Fabric & quantity | Change fabric, then quantity 1→10→1 | Price follows fabric/quantity; no stale value after fast changes; console clean | BLOCKED |
| Q3 | Entry quantity (1.4) | Leave Studio, click Open Studio again | Quantity is 1 | BLOCKED |
| Q4 | Upload (3.3) | Upload normal PNG, drag into frame, press Place it | Real image placed; no broken icon; Your Uploads clean | BLOCKED |
| Q5 | Bad uploads | Upload corrupt `.png`, >10 MB file, SVG | Friendly message for the first two; SVG accepted; no broken tile | BLOCKED |
| Q6 | Network blip | Block the image request briefly (DevTools offline) | A valid upload is NOT removed | BLOCKED |
| Q7 | Fit & zoom (3.5) | Upload square art on Center Front, zoom in/out | Starts fitted inside the dashed frame; zoomed art is cut at the frame edge | BLOCKED |
| Q8 | Long artwork | Upload very tall art on Center Front | Cut at the frame; same crop in the generated mockup | BLOCKED |
| Q9 | Crop | Crop an upload, reopen crop | Crop persists; placed image updates | BLOCKED |
| Q10 | Front/back (3.4) | Upload on front; switch to Full Back and back | Stays on front until Back clicked; each side keeps its art | BLOCKED |
| Q11 | New design (3.6) | Reload Studio with a saved design, press Build | "Continue your last design?"; Start fresh gives an empty frame | BLOCKED |
| Q12 | Mockup success (4.1) | Save T-Shirt | Popup closes; "Creating your preview…"; model shows the design | BLOCKED |
| Q13 | Mockup failure (4.2) | Unset/invalid `GEMINI_API_KEY`, Save | Friendly message + Try again; no technical text anywhere (UI, network responses) | BLOCKED |
| Q14 | Bespoke (2.x, 4.3) | Choose Bespoke; then Fitted again | WhatsApp opens in a new tab with the chosen options; price returns for Fitted/Oversized | BLOCKED |
| Q15 | WhatsApp missing | Run with phone unset | No WhatsApp links; Bespoke shows the "not available" dialog | BLOCKED |
| Q16 | Wishlist (7.2) | Add design to wishlist, change/Add-to-bag the original, open wishlist item | New independent build opens with the saved design; the bag item is unchanged | BLOCKED |
| Q17 | Wishlist missing asset | Delete the asset row in the QA DB, open the item | Notice on /wishlist, no half-empty build | BLOCKED |
| Q18 | Buy Now (7.1) | Change quantity, press Buy Now quickly; also while signed out | Checkout opens with the exact design/qty; signed-out flow resumes after login | BLOCKED |
| Q19 | Image consistency (8.1) | Order a black Oversized design; view Bag, Wishlist, Orders, Checkout | Same, correct cut/colour/design everywhere; plain garment when no fresh mockup | BLOCKED |
| Q20 | Amounts | Checkout with tax + shipping set in admin | All lines are whole pounds and add up; Paymob sandbox amount equals the displayed total; no `$` anywhere | BLOCKED |
| Q21 | Historical amounts | Create an order row with a fractional EGP total in the QA DB | Shown as stored (e.g. EGP 521.33) | BLOCKED |
| Q22 | Payment pages | Pay with a sandbox card; fail a payment | Correct statuses and wording ("Payment pending", etc.) | BLOCKED |
| Q23 | Responsive | 375×812, 768×1024 for Studio, popup, Bag, Wishlist, Orders, Checkout | No overlap/clipping; Place-it card on one line; cards in a neat grid | BLOCKED |
| Q24 | Console/network | Watch console + network through all of the above | No errors; no technical messages to customers | BLOCKED |

Each row must get: exact steps used, actual result, PASS/FAIL, and a screenshot or log excerpt when executed.

## 4. Open client decisions / inputs

1. Fixed EGP price list (the storefront still converts from USD, rounded to whole pounds).
2. Real back-view photo of the model.
3. Production confirmation of Left/Right Chest orientation (labels currently unchanged).
4. Single checkout for the whole bag (Malak).
5. Compact Paymob iframe → new `PAYMOB_IFRAME_ID`.
6. Company WhatsApp number → `NEXT_PUBLIC_WHATSAPP_PHONE` (no fallback now; links disappear if unset).
