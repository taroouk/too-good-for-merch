# Too Good For Merch

Next.js commerce studio with server-calculated pricing, Paymob card/wallet checkout, signed webhook confirmation, and a role-protected operations dashboard.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the database, NextAuth, and Paymob values.
2. Install dependencies with `npm ci`.
3. Apply the database migration with `npx prisma migrate deploy`.
4. Seed or promote an admin account with `npm run`/the existing `scripts/seed-admins.mjs` workflow.
5. Start the app with `npm run dev`.

## Paymob dashboard

Configure the card integration with:

- Processed callback: `https://YOUR_DOMAIN/api/payments/paymob/webhook`
- Response callback: `https://YOUR_DOMAIN/api/payments/paymob/verify`

The processed callback is the only source of payment success. The response callback redirects the customer to a status page, which reads the database and never trusts Paymob’s browser query parameters.

Required server-only values:

```text
PAYMOB_API_KEY
PAYMOB_INTEGRATION_ID
PAYMOB_IFRAME_ID
PAYMOB_HMAC_SECRET
```

Set `PAYMOB_WALLET_INTEGRATION_ID` to show and enable mobile-wallet checkout. Do not use a `NEXT_PUBLIC_` prefix for any Paymob credential.

## Payment lifecycle

Checkout configuration → server price calculation → pending order → Paymob payment key → hosted checkout → HMAC-verified webhook → paid/failed/refunded order.

Every attempt and webhook is retained. Webhook event fingerprints are unique, so retries are idempotent. Admin manual changes are written to the audit log.

## Admin

`/admin` is protected in `proxy.ts` and rechecked by the server layout/actions. An authenticated user must have the `ADMIN` role. The dashboard includes revenue reporting, searchable orders, CSV export, payment/webhook logs, retry links, customer controls, pricing, and store/Paymob settings health.
