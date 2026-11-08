# Paymob integration (Too Good For Merch)

Status 8 Nov 2026: implemented and tested in the isolated copy (Fake Prisma, no network). **Never run against Paymob from here**: no Paymob key, Test or Live, exists in this environment. Everything below that needs your account is listed under "Needs your Paymob account".

## Which Paymob method, and why
Official docs read (developers.paymob.com): *Payment Intention API* (create the payment on your server with the secret key) + *Unified Checkout* (Paymob's hosted page, reached with `publicKey` + `clientSecret`). *Pixel (embedded)* needs an extra activation and is not assumed. The older *Accept* flow (auth token -> order -> payment key -> iframe) is kept as an automatic fallback.

| | Intention + Unified Checkout (new, preferred) | Accept iframe (legacy, kept) |
|---|---|---|
| Server credentials | `PAYMOB_SECRET_KEY` (egy_sk_...) | `PAYMOB_API_KEY` |
| Browser credential | `PAYMOB_PUBLIC_KEY` (egy_pk_...) in the redirect URL | `PAYMOB_IFRAME_ID` |
| Calls per payment | 1 (`POST /v1/intention/`) | 3 (auth, order, payment key) |
| Amount rule | `amount` = sum of `items[].amount`, in piastres (documented) | item vs order amount units never proven |
| Customer sees | Paymob page (full redirect) | Paymob form embedded in our checkout |
| Callback + HMAC | same processed transaction callback, same HMAC-SHA512 list | same |

Selection (`paymobFlow()` in `src/lib/payments/paymob.ts`): secret key + public key present -> intention; otherwise legacy; `PAYMOB_FLOW=legacy|intention` forces one.

## Architecture (what already existed and is reused)
1. Checkout (`app/checkout/page.tsx`) -> `POST /api/payments/paymob/create-intent`: validates the user, the order (server prices, EGP only, expected total approved, terms consent, payable status, superseded/competing payment guards, one live payment link per order, reuse of a live link, DB lock + `PaymentAttempt` so two clicks cannot start two payments).
2. NEW: `createPaymobPayment` -> intention: `POST https://accept.paymob.com/v1/intention/` with `Authorization: Token <secret key>`; body `amount` = the order's own total in piastres (never from the browser), `currency` EGP, `payment_methods: [PAYMOB_INTEGRATION_ID]`, one item carrying the whole total, `billing_data`, `special_reference` = order number (retried once with a `-R...` suffix if Paymob rejects a duplicate), `notification_url` = `<NEXTAUTH_URL>/api/payments/paymob/webhook`, `redirection_url` = `<NEXTAUTH_URL>/orders/<id>/success`. Response `client_secret` + `intention_order_id` (stored as `paymobOrderId`).
3. The server answers `{ paymentUrl, redirect: true }`; the browser goes to `https://eg.checkout.paymob.com/?publicKey=...&clientSecret=...` (override with `PAYMOB_CHECKOUT_URL`). The legacy flow answers `redirect: false` and the form stays embedded.
4. Webhook `POST /api/payments/paymob/webhook?hmac=...` (unchanged): HMAC-SHA512 over the 20 documented fields with `PAYMOB_HMAC_SECRET`, timing-safe compare; matches the order by `merchant_order_id` (our `special_reference`) or by Paymob order id; checks amount, currency, integration id (`PAYMOB_INTEGRATION_ID` / wallet id); idempotent event key; DB row lock; success -> PAID, failed/pending never paid, refunded/voided handled; a second different successful transaction for the same order/design is recorded and flagged for review (no auto refund, no confirmation email).
5. The browser is never trusted: the success page only reads our own order status (`/api/payments/paymob/verify` reads the database, it does not accept a status from the URL).
6. Secrets: only `PAYMOB_SECRET_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_API_KEY` stay on the server; `PAYMOB_PUBLIC_KEY` is public by design. Request logging redacts anything named key/secret/token/pan/cvv; no card data is stored (the card form is Paymob's).

## Environment variables
| Variable | Needed | Value |
|---|---|---|
| `PAYMOB_SECRET_KEY` | yes (intention) | Dashboard -> Settings -> Account info, `egy_sk_test_...` while testing |
| `PAYMOB_PUBLIC_KEY` | yes (intention) | same page, `egy_pk_test_...` |
| `PAYMOB_INTEGRATION_ID` | yes | your card integration, now `6043852` (test) |
| `PAYMOB_HMAC_SECRET` | yes | same page as the keys |
| `NEXTAUTH_URL` | yes | the https site URL (used for callback/redirect URLs) |
| `PAYMOB_API_KEY` | refunds, and legacy flow | Account info |
| `PAYMOB_IFRAME_ID` | legacy flow only | |
| `PAYMOB_WALLET_INTEGRATION_ID` | optional | wallet integration |
| `PAYMOB_CHECKOUT_URL` | optional | default `https://eg.checkout.paymob.com` |
| `PAYMOB_FLOW` | optional | `legacy` / `intention` |
`scripts/check-production-env.mjs` and `/api/health/ready` now require ONE complete credential set (secret+public, or api key+iframe) instead of always requiring the legacy pair.

## Needs your Paymob account (not verifiable from here)
1. **Integration 6043852 ("VPC", Non-Shopify)** must be an *Online Card* integration usable with the Intention API. If `POST /v1/intention/` answers 404 / "invalid integration id", it is not; create (or ask Paymob support to enable) an Online Card integration for Intention/Unified Checkout and put its id in `PAYMOB_INTEGRATION_ID`. Test and live keys/ids must not be mixed.
2. Copy the secret key, public key and HMAC secret (same dashboard page).
3. Integration -> "Transaction processed callback": set `https://<your-domain>/api/payments/paymob/webhook` (a fallback; the intention carries its own `notification_url`).
4. Branding of Unified Checkout (logo, colours `#000000`, `#FFFFFF`, `#777777`): use whatever branding/customization page your dashboard shows for Unified Checkout, or ask Paymob support. The hosted page cannot be styled with our CSS.
5. Pixel (embedded) is not used; nothing to enable.

## Tests
- Unit (`node scripts/run-payments-tests.mjs`): request contract (endpoint, `Token` header, amount = sum of items, references, URLs, checkout URL), duplicate `special_reference` retry, non-EGP / bad amount / missing key refused before any network, no secret in errors, flow selection, HMAC valid/invalid/tampered, classification, duplicate charge flag.
- Isolated HTTP (`scripts/isolation/qa/*.mjs`, Fake Prisma): payment path (reuse, in-flight 409, paid 409, other user 404), audit-fix cases, cart checkout, double-payment webhook sequences. They prove this application's decisions, not PostgreSQL or Paymob.
- NOT done (needs your test keys): a real `POST /v1/intention/`, the hosted page, the real callback and its HMAC, redirection, PostgreSQL row locks.

## How to test a full order (after you set the Test keys)
1. In Vercel/hosting env set the variables above with the **test** values; redeploy.
2. Open the site, build a design, Add to Bag (or Buy Now), Checkout, accept the terms, press pay: you are sent to the Paymob page.
3. Pay with Paymob's published test card (Developers -> Test credentials). Expected: redirect to `/orders/<id>/success`, the order becomes Confirmed within seconds (the page refreshes itself up to four times); admin -> Orders shows PAID with the Paymob transaction id.
4. Declined card: order stays unpaid, "Payment failed" with a retry button. Close the tab before paying and press pay again later: the same live link is reused.
5. Check Paymob dashboard -> Transactions shows the same amount; admin -> System health shows no payment warnings.
