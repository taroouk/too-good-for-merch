# Studio Code Audit — Part 1

**Project:** Too Good For Merch
**Date:** 2026-08-06
**Scope:** Inspection and analysis only. No code modifications, refactors, or deletions.
**Status:** Part 1 of 5 — Architecture Overview, File Inventory, Dead Code

---

# 1. Studio Architecture Overview

## 1.1 High-Level

The Studio is a Next.js 16 (App Router) application that provides a browser-based
t-shirt configurator with artwork upload, placement editing, print mockup
generation, AI mockup generation, and e-commerce checkout.

The codebase is organized into layers:

| Layer | Location | Responsibility |
|---|---|---|
| Pages / Routes | `app/studio/`, `app/api/mockups/`, `app/api/assets/`, `app/api/build/`, `app/api/orders/`, `app/api/payments/`, `app/api/pricing/` | Next.js Route Handlers and Page components |
| Server Actions | `src/actions/` | `"use server"` form handlers and data mutations |
| Data Access | `src/db/` | Prisma query helpers for `Build`, `Mockup`, `Asset` |
| Auth / Permissions | `src/studio/authz.ts`, `src/studio/permissions.ts`, `src/auth.ts` | Session resolution, build access control, guest cookies |
| Render Engine | `src/studio/render/` | Deterministic Sharp-based mockup compositing |
| UI Components | `src/studio/ui/` | Client components for the builder, previews, modals |
| Pricing | `src/pricing/` | Price calculation engine and placement parsing |
| Storage | `src/lib/storage.ts` | Artwork upload, validation, retrieval from Postgres BYTEA |
| Payments | `src/lib/payments/paymob.ts` | Paymob integration (order creation, HMAC verification) |
| Checkout | `src/lib/orders/checkout.ts` | Order creation transaction |

## 1.2 Builder

**Files:** `app/studio/projects/[buildId]/builder/page.tsx`, `src/studio/ui/BuilderClient.tsx`

The Builder is the central Studio view. The server-side page (`builder/page.tsx`)
fetches the `Build`, its `BuildDraft`, user assets, and existing mockup URLs from
the database, then passes them as props to `BuilderClient.tsx` — a 1,353-line
client component.

`BuilderClient.tsx` manages:
- **Product/color/fabric selection** via inline state (`useState<DraftDTO>`) and `actionUpdateDraft`
- **Artwork upload** via `actionCreateAssetForBuilder` (async, with `startTransition`)
- **Asset attachment** from other builds via `actionAttachExistingAsset`
- **Artwork transform** (drag, scale, reset) stored as local state
- **Print mockup generation** via `POST /api/mockups/print`
- **AI mockup generation** via `POST /api/mockups/nanobanana`
- **Pricing** via `POST /api/pricing/quote` (debounced `useEffect`)
- **Auth flow** (login/signup modal, session handling via `next-auth/react`)
- **Checkout** (redirect to `/checkout` page — see §3 Dead Code for the deprecated modal flow)
- **Live preview** via `TryOn3DPreview` component
- **Bespoke modal** for detailed artwork placement editing (`BespokeModal`)

The Builder uses `html-to-image` and Canvas 2D APIs (`exportMannequinReferenceImage`,
`exportCompositePreview`) to produce images for the Gemini AI mockup request.

## 1.3 Upload

**Files:** `src/actions/asset-actions.ts`, `src/lib/storage.ts`,
`app/api/assets/[assetId]/file/route.ts`

Upload flow:
1. `BuilderClient` calls `actionCreateAssetForBuilder` (server action)
2. Server action calls `uploadArtwork()` from `src/lib/storage.ts`
3. `uploadArtwork()` validates MIME type, file size (≤10 MB), and magic bytes
4. Artwork is stored as `Asset.artworkData` BYTEA in Postgres (`storageKey` is always `null`)
5. An `Asset` row is created with `status: "READY"`
6. `app/api/assets/[assetId]/file/route.ts` serves the raw artwork bytes on request

## 1.4 Draft

**Files:** `src/db/builds.ts`, `src/actions/build-actions.ts`, `prisma/schema.prisma` (BuildDraft model)

A `BuildDraft` is the mutable design state attached to a `Build`. It stores:
- `product`, `color`, `fabric` (enums or null)
- `quantity` (Int, default 1)
- `customNotes` (String, stores placement JSON or custom hex tags)
- `primaryAssetId` (FK to Asset)
- `printMockupId` / `printMockupFingerprint` / `printMockupGeneratedAt` (FK + cache metadata for Print Mockup)
- `aiMockupId` / `aiMockupFingerprint` / `aiMockupGeneratedAt` (FK + cache metadata for AI Mockup)

Draft mutations happen via `actionUpdateDraft` server action, which validates enum values
from FormData and calls `prisma.buildDraft.update`.

## 1.5 Asset

**Files:** `prisma/schema.prisma` (Asset model), `src/db/builds.ts`, `src/actions/asset-actions.ts`,
`src/lib/storage.ts`, `app/api/assets/[assetId]/file/route.ts`

Assets are customer-uploaded artwork files. Stored as BYTEA (`artworkData`) in Postgres
since the `20260718120000_store_artwork_in_postgres` migration. The `storageKey` column
exists in the schema but is always set to `null` — the file-based storage path was removed.

Assets are queried in the builder page: `app/studio/projects/[buildId]/builder/page.tsx`
fetches the 24 most recent assets with `url IS NOT NULL`.

## 1.6 Print Mockup

**Files:**
- API: `app/api/mockups/print/route.ts`
- Persistence: `src/db/mockup.ts` (`upsertPrintMockup`, `getDraftPrintMockupUrl`)
- Renderer: `src/studio/render/engines/sharp-renderer.ts`, `src/studio/render/index.ts`
- Placement config: `src/studio/render/placement-config.ts`, `src/studio/render/transform.ts`,
  `src/studio/render/templates.ts`

Print Mockup flow:
1. `BuilderClient.generatePrintMockup()` → `POST /api/mockups/print`
2. Route handler validates the request, checks build access, fetches artwork bytes
3. Computes a SHA-256 fingerprint over `(assetId, placement, x, y, scale, rotation, product, color)`
   via `computeMockupFingerprint()`
4. Deduplicates in-flight requests by `${draftId}:${fingerprint}`
5. Loads the garment template buffer via `loadTemplateBuffer()`
6. Calls `getRenderer().render()` → `SharpMockupRenderer` composites artwork onto template
7. Validates output via `validateMockupData()`
8. Persists via `upsertPrintMockup()` → stores `Mockup.data` BYTEA + links `BuildDraft.printMockupId`
9. Returns `imageUrl` for the client to display

## 1.7 AI Mockup

**Files:** `app/api/mockups/nanobanana/route.ts`, `src/db/mockup.ts` (`upsertAiMockup`)

AI Mockup flow:
1. `BuilderClient.generateNanoBananaMockup()` exports two images client-side:
   - `exportMannequinReferenceImage()` — garment model image via Canvas 2D
   - `exportCompositePreview()` — artwork composited onto model via `html-to-image`
2. POSTs to `/api/mockups/nanobanana` with both images + transform parameters
3. The API calls Gemini `/v1beta/interactions` with a prompt that attempts to constrain
   the model to preserve artwork fidelity (see `nanoBananaPrompt`)
4. Parses Gemini's response with a highly tolerant multi-shape image parser
5. Persists via `upsertAiMockup()` → stores `Mockup.data` BYTEA + links `BuildDraft.aiMockupId`
6. Returns `imageUrl` for the client

The AI Mockup route is 680 lines, dominated by Gemini response parsing logic.

## 1.8 Checkout

**Files:** `app/checkout/page.tsx`, `app/api/payments/paymob/create-intent/route.ts`,
`src/lib/orders/checkout.ts`, `src/lib/payments/paymob.ts`

Checkout flow (active path):
1. `BuilderClient.openCheckout()` redirects to `/checkout?buildId=...`
2. `app/checkout/page.tsx` is a standalone client page that fetches
   `GET /api/build/[id]` for pricing/quote
3. On submit, POSTs to `/api/payments/paymob/create-intent`
4. `create-intent` route calls `createCheckoutOrder()` which:
   - Validates the build and customer details
   - Computes price via `computePrice()`
   - Creates an `Order` + `OrderItem` in a transaction
   - Calls `createPaymobPayment()` to create a Paymob payment intent
   - Redirects the user to Paymob's hosted payment page
5. Paymob webhooks are received at `app/api/payments/paymob/webhook/route.ts`
6. Payment status is verified via `app/api/payments/paymob/verify/route.ts`

**Note:** `BuilderClient.tsx` also contains a deprecated in-modal checkout flow
(`CheckoutModal`, `handleCheckoutSubmit`, `checkoutAfterAuth` state) that has been
superseded by the redirect to `/checkout`. See §3 Dead Code for details.

## 1.9 Rendering

**Files:** `src/studio/render/` (all files), `app/api/mockups/print/route.ts`

The rendering pipeline:
1. Placement geometry is defined in `placement-config.ts` — `getPlacementBox()` returns
   percentage-based coordinates for each `(product, placement)` pair
2. `transform.ts` — `resolvePlacement()` converts percentages + transform (x, y, scale, rotation)
   to absolute pixel coordinates on the template
3. `templates.ts` — `loadTemplateBuffer()` loads the garment PNG from disk (`/public/images/`)
4. `sharp-renderer.ts` — `SharpMockupRenderer.render()` resizes the artwork, applies rotation,
   and composites it onto the template at the resolved coordinates
5. `index.ts` — `getRenderer()` is a factory that returns a singleton `MockupRenderer`
6. Tests in `__tests__/` validate fingerprint determinism, placement geometry, rendering
   determinism, and golden snapshot regression

The render engine is tested via `scripts/run-render-tests.mjs` (custom test runner, not Jest/Vitest).

## 1.10 Storage

**Files:** `src/lib/storage.ts`, `storage/artwork/` (runtime data dir, gitignored)

Storage is entirely Postgres BYTEA:
- `Asset.artworkData` (Bytes) — raw uploaded artwork
- `Mockup.data` (Bytes) — generated mockup images
- `Asset.artworkSha256`, `Mockup.sha256` — content hashes for deduplication

The `storage/artwork/` directory on the filesystem contains stale data from the
pre-migration file-based storage era (gitignored, not referenced by the active code path).

`storageKey` column on `Asset` is always `null` — the migration moved to BYTEA.

## 1.11 Database

**File:** `prisma/schema.prisma`

Core models relevant to Studio:
- **User** — authentication, has `builds` and `orders`
- **Build** — top-level design project, has `draft`, `assets`, `designs`, `orders`, `mockups`
- **BuildDraft** — mutable design state (product, color, fabric, quantity, placements, mockup links)
- **Mockup** — generated mockup image (kind: PRINT or AI), has `data` BYTEA, `fingerprint`,
  `sha256`, `model`, `placement`, `prompt`, `parentId` (for AI→Print linking)
- **Asset** — uploaded artwork (BYTEA, sha256, storageKey=null)
- **Design** / **DesignPlacement** — design template placements (appears to be a newer design
  feature, partially implemented)
- **Order** / **OrderItem** — e-commerce orders
- **PricingRule** / **PlacementPricingRule** — pricing data
- **PaymentAttempt** / **WebhookEvent** — payment tracking
- **StoreSetting** — store configuration
- **AdminAuditLog** / **AdminNote** — admin operations

## 1.12 Communication Map

```
User interacts in Browser
  │
  ├─ BuilderClient.tsx (client state)
  │    ├─ actionUpdateDraft → prisma.buildDraft.update
  │    ├─ actionCreateAssetForBuilder → uploadArtwork → prisma.asset.create
  │    ├─ actionAttachExistingAsset → prisma.asset.create (copy)
  │    ├─ GET /api/pricing/quote → computePrice → prisma.pricingRule
  │    ├─ POST /api/mockups/print → SharpMockupRenderer.render()
  │    │     └─ upsertPrintMockup → Mockup(kind=PRINT) + BuildDraft.printMockupId
  │    ├─ POST /api/mockups/nanobanana → Gemini API
  │    │     └─ upsertAiMockup → Mockup(kind=AI) + BuildDraft.aiMockupId
  │    └─ openCheckout → redirect to /checkout
  │         └─ POST /api/payments/paymob/create-intent → createCheckoutOrder + createPaymobPayment
  │
  ├─ GET /api/mockups/{id}/file → getMockup → Mockup.data BYTEA
  ├─ GET /api/assets/{id}/file → getArtwork → Asset.artworkData BYTEA
  └─ POST /api/payments/paymob/webhook → verifyPaymobHmac + order/payment status update
```

---

# 2. File Inventory

## 2.1 Studio Source — `src/studio/`

| Path | LOC | Responsibility | Imported By | Runtime Usage | Status |
|---|---|---|---|---|---|
| `src/studio/authz.ts` | 25 | Session-based user ID resolution (`getUserId`, `requireUserId`) | `src/actions/build-actions.ts`, `src/actions/asset-actions.ts`, `src/actions/design-actions.ts`, `app/studio/pages`, `app/studio/layouts` | Server-side auth checks in pages and actions | KEEP |
| `src/studio/permissions.ts` | 55 | Build access control (`canAccessBuild`, `assertBuildAccess`, `hasBuildAccess`, guest cookies) | All Studio pages, actions, and API routes | Access control for builds, guest build tracking | KEEP |
| `src/studio/render/index.ts` | 25 | Renderer factory (`getRenderer`), re-exports types | `app/api/mockups/print/route.ts`, render tests | Server-side mockup rendering | KEEP |
| `src/studio/render/types.ts` | 37 | Types: `ArtworkTransform`, `PlacementBox`, `RenderRequest`, `RenderedMockup`, `MockupRenderer` | `index.ts`, `transform.ts`, `sharp-renderer.ts`, render tests | Render type definitions | KEEP |
| `src/studio/render/transform.ts` | 60 | Placement geometry math (`resolvePlacement`, `validateTransform`, `TRANSFORM_BOUNDS`, `ResolvedPlacement`) | `sharp-renderer.ts`, render tests | Server-side pixel math | KEEP |
| `src/studio/render/placement-config.ts` | 77 | Single source of truth for placement geometry (`getPlacementBox`, `getGarmentTemplate`, `getPlacementSide`, `PLACEMENT_CONFIG_VERSION`) | `sharp-renderer.ts`, `transform.ts`, `templates.ts`, render tests | Placement and template resolution | KEEP |
| `src/studio/render/templates.ts` | 20 | Garment template buffer loading (`loadTemplateBuffer`) | `app/api/mockups/print/route.ts`, render tests | Server-side template loading | KEEP |
| `src/studio/render/errors.ts` | 10 | `RendererError` class with HTTP status | `app/api/mockups/print/route.ts` | Error handling in print route | KEEP |
| `src/studio/render/engines/sharp-renderer.ts` | 59 | Sharp-based `MockupRenderer` implementation | `index.ts`, render tests | Server-side image compositing | KEEP |
| `src/studio/render/__tests__/end-to-end.test.ts` | 45 | Fingerprint determinism + template resolution tests | `scripts/run-render-tests.mjs` | Custom test runner | KEEP |
| `src/studio/render/__tests__/golden-snapshot.test.ts` | 82 | Golden image regression hash tests | `scripts/run-render-tests.mjs` | Custom test runner | KEEP |
| `src/studio/render/__tests__/placement-config.test.ts` | 47 | Placement box validation tests | `scripts/run-render-tests.mjs` | Custom test runner | KEEP |
| `src/studio/render/__tests__/sharp-renderer.test.ts` | 136 | Sharp renderer determinism, pixel preservation, DPI-independence tests | `scripts/run-render-tests.mjs` | Custom test runner | KEEP |
| `src/studio/render/__tests__/sharp-renderer.edge.test.ts` | 89 | Sharp renderer edge case tests (transparent, tiny, large, NaN, extreme transforms) | `scripts/run-render-tests.mjs` | Custom test runner | KEEP |
| `src/studio/ui/BuilderClient.tsx` | 1,353 | Main builder client component (state, upload, drag/scale, price, mockup, auth, checkout) | `app/studio/projects/[buildId]/builder/page.tsx` | Browser — primary Studio UI | KEEP |
| `src/studio/ui/LiveMockupPreview.tsx` | 830 | Alternative `BuilderClient` implementation (inline styles, different layout) | **NEVER IMPORTED** | Not rendered | DELETE |
| `src/studio/ui/TryOn3DPreview.tsx` | 195 | 3D-style garment preview (model image + artwork overlay, side switching) | `BuilderClient.tsx` | Browser — live preview | KEEP |
| `src/studio/ui/StudioNavbar.tsx` | 80 | Studio navigation bar (only has "Builder" tab) | `app/studio/projects/[buildId]/layout.tsx` | Browser — navigation | KEEP |
| `src/studio/ui/components/CheckoutButton.tsx` | 29 | Checkout button component | `BuilderClient.tsx` | Browser — checkout trigger | KEEP |
| `src/studio/ui/components/ColorSelector.tsx` | 79 | Black/White/Custom color selection | `BuilderClient.tsx` | Browser — color picker | KEEP |
| `src/studio/ui/components/FabricSelector.tsx` | 121 | Fabric dropdown selector | `BuilderClient.tsx` | Browser — fabric picker | KEEP |
| `src/studio/ui/components/PriceCard.tsx` | 16 | Price display card | `BuilderClient.tsx` | Browser — price display | KEEP |
| `src/studio/ui/components/ProductSelector.tsx` | 78 | Fitted/Oversized/Bespoke product selection | `BuilderClient.tsx` | Browser — product picker | KEEP |
| `src/studio/ui/components/QuantitySelector.tsx` | 51 | Quantity +/- stepper | `BuilderClient.tsx` | Browser — quantity input | KEEP |
| `src/studio/ui/modals/ArtworkModal.tsx` | 50 | Custom garment request modal | `BuilderClient.tsx` | Browser — bespoke entry | KEEP |
| `src/studio/ui/modals/AuthModal.tsx` | 148 | Login/signup modal | `BuilderClient.tsx` | Browser — auth (see §3) | KEEP |
| `src/studio/ui/modals/BespokeModal.tsx` | 364 | Bespoke builder modal (artwork overlay, placements, AI/print mockup, uploads) | `BuilderClient.tsx` | Browser — detailed editor | KEEP |
| `src/studio/ui/modals/CheckoutModal.tsx` | 131 | Checkout form modal (deprecated — see §3) | `BuilderClient.tsx` (imported but never rendered) | Not rendered | REFACTOR |

## 2.2 Studio Actions — `src/actions/`

| Path | LOC | Responsibility | Imported By | Runtime Usage | Status |
|---|---|---|---|---|---|
| `src/actions/build-actions.ts` | 125 | `actionCreateBuild`, `actionRenameBuild`, `actionUpdateDraft` (server actions) | `app/studio/projects/new/page.tsx`, `app/studio/projects/[buildId]/settings/page.tsx`, `BuilderClient.tsx` | Server actions for build/draft CRUD | KEEP |
| `src/actions/asset-actions.ts` | 130 | `actionCreateAsset`, `actionCreateAssetForBuilder`, `actionAttachExistingAsset` (server actions) | `BuilderClient.tsx` | Server actions for asset CRUD | KEEP |
| `src/actions/design-actions.ts` | 98 | `actionCreateDesign`, `actionSetPlacementAsset`, `actionRemovePlacement` (server actions) | **NEVER IMPORTED** | Not called | DELETE |

## 2.3 Studio Data Access — `src/db/`

| Path | LOC | Responsibility | Imported By | Runtime Usage | Status |
|---|---|---|---|---|---|
| `src/db/builds.ts` | 69 | `listBuildsByUser`, `createBuildForUser`, `getBuildWithDraft`, `renameBuild` | `app/studio/projects/page.tsx` (only `listBuildsByUser`) | Data access for builds | REFACTOR |
| `src/db/mockup.ts` | 209 | `computeMockupFingerprint`, `upsertPrintMockup`, `upsertAiMockup`, `getDraftPrintMockupUrl`, `clearPrintMockupFromDraft`, `clearAiMockupFromDraft`, `getDraftAiMockupUrl` + types | `app/api/mockups/print/route.ts`, `app/api/mockups/nanobanana/route.ts`, `BuilderClient.tsx`, render tests | Server-side mockup persistence | KEEP |

## 2.4 Studio Pages — `app/studio/`

| Path | LOC | Responsibility | Runtime Usage | Status |
|---|---|---|---|---|
| `app/studio/layout.tsx` | 7 | Root Studio layout (renders children) | Wraps all `/studio/*` routes | KEEP |
| `app/studio/page.tsx` | 38 | Redirects to latest build or `/studio/start` | Studio entry point | KEEP |
| `app/studio/start/route.ts` | 50 | GET route: creates starter build, redirects to builder | Studio start flow | KEEP |
| `app/studio/projects/page.tsx` | 91 | Lists user builds (or guest prompt) | Studio projects list | KEEP |
| `app/studio/projects/new/page.tsx` | 26 | Create project form (calls `actionCreateBuild`) | Studio project creation | KEEP |
| `app/studio/projects/[buildId]/page.tsx` | 57 | Build overview (draft details, asset/design counts) | Project overview | KEEP |
| `app/studio/projects/[buildId]/layout.tsx` | 34 | Project layout with `StudioNavbar` | Wraps all build sub-routes | KEEP |
| `app/studio/projects/[buildId]/builder/page.tsx` | 103 | Builder page — fetches build/draft/assets, renders `BuilderClient` | Studio builder | KEEP |
| `app/studio/projects/[buildId]/assets/page.tsx` | 11 | Redirects to builder | Redirect-only page | KEEP |
| `app/studio/projects/[buildId]/designs/page.tsx` | 11 | Redirects to builder | Redirect-only page | UNKNOWN |
| `app/studio/projects/[buildId]/settings/page.tsx` | 47 | Rename build form (calls `actionRenameBuild`) | Project settings | KEEP |

## 2.5 Studio API Routes — `app/api/`

| Path | LOC | Responsibility | Runtime Usage | Status |
|---|---|---|---|---|
| `app/api/mockups/print/route.ts` | 178 | POST: generate print mockup via Sharp renderer | BuilderClient `generatePrintMockup()` | KEEP |
| `app/api/mockups/nanobanana/route.ts` | 680 | POST: generate AI mockup via Gemini | BuilderClient `generateNanoBananaMockup()` | REFACTOR |
| `app/api/mockups/nanobanana copy/route.ts` | 576 | Backup copy of nanobanana route (uses file storage, has broken `geminiError` reference) | **NEVER ROUTED** (space in dir name) | DELETE |
| `app/api/mockups/[id]/file/route.ts` | 50 | GET: serve mockup image bytes | BuilderClient image display | KEEP |
| `app/api/assets/[assetId]/file/route.ts` | 46 | GET: serve artwork bytes | BuilderClient image display | KEEP |
| `app/api/build/[id]/route.ts` | 86 | GET: build quote (product, fabric, quantity, price) | `app/checkout/page.tsx` | KEEP |
| `app/api/build/create/route.ts` | 8 | POST: returns 410 Gone (deprecated) | Deprecated | DELETE |
| `app/api/create-and-open-project/route.ts` | 60 | POST: create build with rate limiting (replaces `build/create`) | `app/studio/start/route.ts` (indirectly) | KEEP |
| `app/api/orders/create/route.ts` | 8 | POST: returns 410 Gone (deprecated) | Deprecated | DELETE |
| `app/api/payments/paymob/create-intent/route.ts` | 168 | POST: create Paymob payment intent + order | `app/checkout/page.tsx`, `BuilderClient.tsx` (deprecated path) | KEEP |
| `app/api/payments/paymob/create/route.ts` | 8 | POST: returns 410 Gone (deprecated) | Deprecated | DELETE |
| `app/api/payments/paymob/verify/route.ts` | 69 | GET/POST: verify payment status | Order pages | KEEP |
| `app/api/payments/paymob/webhook/route.ts` | 147 | POST: Paymob webhook handler | Paymob | KEEP |
| `app/api/payments/webhook/route.ts` | 2 | Re-exports `POST` from `paymob/webhook` | Paymob webhook | KEEP |
| `app/api/pricing/quote/route.ts` | 43 | POST: compute price for product/fabric/quantity/placements | BuilderClient, checkout | KEEP |

## 2.6 Supporting Files

| Path | LOC | Responsibility | Runtime Usage | Status |
|---|---|---|---|---|
| `proxy.ts` | 14 | Admin proxy middleware (unused) | **NEVER IMPORTED** | DELETE |
| `app/api/mockups/nanobanana.zip` | ~7 files | Binary zip backup of old nanobanana route | Not referenced | DELETE |
| `scripts/run-render-tests.mjs` | 94 | Custom render test runner | `npm run test:render` | KEEP |
| `scripts/render-golden-snapshot.json` | 5 | Golden image hash baseline | `golden-snapshot.test.ts` | KEEP |
| `scripts/check-production-env.mjs` | 58 | Production env var validation | `npm run check:prod` | KEEP |
| `scripts/seed-admins.mjs` | varies | Admin seeding | `npm run db:seed:admins` | KEEP |

## 2.7 `.DS_Store` Files (macOS metadata)

| Path | Status |
|---|---|
| `.DS_Store` | DELETE |
| `app/.DS_Store` | DELETE |
| `app/api/.DS_Store` | DELETE |
| `app/api/mockups/.DS_Store` | DELETE |
| `app/studio/.DS_Store` | DELETE |
| `app/studio/projects/.DS_Store` | DELETE |
| `app/studio/projects/[buildId]/.DS_Store` | DELETE |
| `public/.DS_Store` | DELETE |
| `src/.DS_Store` | DELETE |

---

# 3. Dead Code

## 3.1 Dead Files (Never Imported or Routed)

### 3.1.1 `src/studio/ui/LiveMockupPreview.tsx` (830 lines)

**Proof:** `LiveMockupPreview.tsx` exports a default `BuilderClient` component. A grep for
`LiveMockupPreview` across all `.ts` and `.tsx` files returns zero matches outside the file
itself. The active builder page (`app/studio/projects/[buildId]/builder/page.tsx:5`) imports
`BuilderClient` from `src/studio/ui/BuilderClient`, not from `LiveMockupPreview`. The file
appears to be an earlier alternative implementation that was superseded.

### 3.1.2 `src/actions/design-actions.ts` (98 lines)

**Proof:** A grep for `actionCreateDesign`, `actionSetPlacementAsset`, and `actionRemovePlacement`
across all `.ts` and `.tsx` files returns matches only within `design-actions.ts` itself
(definitions only). No page, component, or server action imports or calls these functions.
The `Design` / `DesignPlacement` models exist in the schema but have no wired UI flow.

### 3.1.3 `app/api/mockups/nanobanana copy/route.ts` (576 lines)

**Proof:** The route is in a directory named `nanobanana copy` (with a space). Next.js App
Router does not register routes from directories with spaces in this context; the active
route is `app/api/mockups/nanobanana/route.ts`. Additionally, this file references a
non-existent function `geminiError` at line 554:
```ts
return apiError(await geminiError(geminiRes), 500);
```
No `geminiError` function is defined in the file — the main `nanobanana/route.ts` uses
`geminiFailureMessage` instead. This file is a broken backup copy.

### 3.1.4 `app/api/mockups/nanobanana.zip`

**Proof:** A binary zip archive in the API directory. No source file references or imports
this path. It is a leftover artifact.

### 3.1.5 `proxy.ts` (14 lines)

**Proof:** `proxy.ts` exports a `proxy` function and `config` object at the project root. It is
never imported by any `.ts` or `.tsx` file. It is not registered as a Next.js middleware
(no `middleware.ts` exists). The file references `next-auth/jwt`'s `getToken` and admin role
checking, but is unreachable.

### 3.1.6 `.DS_Store` files (9 files)

**Proof:** `.DS_Store` is a macOS Finder metadata file. The `.gitignore` includes `.DS_Store`,
but 9 copies exist in the repository. They are not source files and should be removed and
gitignored (confirmed ignored in `.gitignore` line: `.DS_Store`).

## 3.2 Dead Exports (Defined But Never Imported)

### 3.2.1 `src/db/mockup.ts`

| Export | Proof |
|---|---|
| `MockupInput` (type) | Grep for `MockupInput` across all `.ts`/`.tsx` files returns only the definition at `db/mockup.ts:5`. Never imported. |
| `MockupRecord` (type) | Grep returns only definitions within `db/mockup.ts` (used as return type of `upsertPrintMockup` and `upsertAiMockup`, but never imported externally). Not dead in absolute terms (used internally) but exported unnecessarily. |
| `clearPrintMockupFromDraft` | Defined at `db/mockup.ts:159`. Grep for `clearPrintMockupFromDraft` returns only the definition. Never imported or called. |
| `clearAiMockupFromDraft` | Defined at `db/mockup.ts:171`. Grep for `clearAiMockupFromDraft` returns only the definition. Never imported or called. |
| `getDraftAiMockupUrl` | Defined at `db/mockup.ts:197`. Grep returns only the definition. Never imported or called. (Contrast: `getDraftPrintMockupUrl` IS called at `print/route.ts:119`.) |

### 3.2.2 `src/db/builds.ts`

| Export | Proof |
|---|---|
| `createBuildForUser` | Defined at `db/builds.ts:19`. Grep returns only the definition. Never imported. The equivalent logic exists in `build-actions.ts:24` (`actionCreateBuild`) and `start/route.ts:10` (`createStarterBuild`). |
| `getBuildWithDraft` | Defined at `db/builds.ts:30`. Grep returns only the definition. Never imported. The builder page does its own inline `prisma.build.findUnique` query instead. |
| `renameBuild` | Defined at `db/builds.ts:64`. Grep returns only the definition. Never imported. The equivalent exists in `build-actions.ts:57` (`actionRenameBuild`). |

### 3.2.3 `src/lib/storage.ts`

| Export | Proof |
|---|---|
| `looksLikeAllowedMockup` | Defined at `storage.ts:88`. Grep returns only definitions within `storage.ts` itself (called internally at line 115). Never imported externally. |
| `normalizeMockupMimeType` | Defined at `storage.ts:101`. Grep returns only definitions within `storage.ts` itself (called internally at line 108). Never imported externally. |

### 3.2.4 `src/lib/fonts.ts`

| Export | Proof |
|---|---|
| `inter` | Defined at `fonts.ts:5`. Grep for `from "src/lib/fonts"` across all `.ts`/`.tsx` returns zero matches. Never imported anywhere. |
| `league` | Defined at `fonts.ts:12`. Same grep — zero matches. Never imported anywhere. |

### 3.2.5 `src/studio/render/transform.ts`

| Export | Proof |
|---|---|
| `TRANSFORM_BOUNDS` | Defined at `transform.ts:17`. Grep returns only definition and self-references at `transform.ts:25,33`. Never imported externally. |
| `ResolvedPlacement` | Defined at `transform.ts:5`. Grep returns only the definition. Never imported externally (consumers use the return type implicitly). |

### 3.2.6 `src/studio/ui/StudioNavbar.tsx`

| Export | Proof |
|---|---|
| `projectName` prop | The component type declares `projectName: string` in its props type (line 16), but the destructured parameters (line 12-17) only destructure `projectId`. The caller at `layout.tsx:30` passes `projectName={projectName}` but it is never read inside the component. |

## 3.3 Dead State / Unreachable Code Paths in `BuilderClient.tsx`

### 3.3.1 `CheckoutModal` and related checkout state

**Proof:** The `openCheckout` function (`BuilderClient.tsx:601-619`) was refactored to redirect
to `/checkout?buildId=...` instead of opening an in-modal checkout. The comment at line 618
reads: `// بدل popup القديم → redirect مباشر` ("instead of the old popup → direct redirect").

The `CheckoutModal` component is imported (line 41) and rendered in a portal (line 1098),
but the `showCheckout` state that controls it can never become `true`:
- `checkoutAfterAuth` (`useState(false)`, line 218) is never set to `true`
- `openCheckout` does NOT call `setCheckoutAfterAuth(true)` before showing the auth modal
- `setCheckoutAfterAuth(true)` has zero call sites (grep confirms only `useState(false)` at
  line 218, `if (checkoutAfterAuth)` check at line 403, and dependency array at line 410)
- `closeAuthModal` (line 822-824) explicitly resets `setCheckoutAfterAuth(false)`

The following `BuilderClient.tsx` state and functions are only reachable via the `CheckoutModal`
and are therefore unreachable dead code:

| Symbol | Line | Purpose |
|---|---|---|
| `showCheckout` | 217 | Controls CheckoutModal portal visibility |
| `checkoutAfterAuth` | 218 | Flag for post-auth checkout flow (never set true) |
| `customerName` | 219 | CheckoutModal customer name field |
| `customerEmail` | 220 | CheckoutModal customer email field |
| `customerPhone` | 221 | CheckoutModal customer phone field |
| `paymentMethod` | 222 | CheckoutModal payment method radio |
| `checkoutError` | 223 | CheckoutModal error display |
| `checkoutOrderId` | 224 | CheckoutModal order ID (retry logic) |
| `closeCheckoutModal` | 831 | CheckoutModal close handler |
| `selectCardPayment` | 835 | CheckoutModal card selection |
| `selectWalletPayment` | 839 | CheckoutModal wallet selection |
| `handleCheckoutSubmit` | 621 | CheckoutModal submit handler |

### 3.3.2 `CheckoutModal.tsx` component file

**Proof:** `CheckoutModal` is imported by `BuilderClient.tsx` (line 41) but, as established
in §3.3.1, the portal that renders it (`<CheckoutModal>` at line 1098) is gated behind
`showCheckout`, which is never `true`. The standalone `app/checkout/page.tsx` (288 lines)
is the active checkout flow. The `CheckoutModal.tsx` file (131 lines) is dead code: KEEP (still imported, but REFACTOR candidate).

## 3.4 Unused Package Dependencies

### 3.4.1 `three`

**Proof:** `package.json` line 16 lists `"three": "^0.184.0"`. Grep for `from "three"` or
`import.*three` across all `.ts`/`.tsx` files returns zero matches. Never imported in source.

### 3.4.2 `@react-three/fiber`

**Proof:** `package.json` line 12 lists `"@react-three/fiber": "^9.6.0"`. Grep returns zero
matches. Never imported in source.

### 3.4.3 `@react-three/drei`

**Proof:** `package.json` line 10 lists `"@react-three/drei": "^10.7.7"`. Grep returns zero
matches. Never imported in source.

### 3.4.4 `fabric`

**Proof:** `package.json` line 15 lists `"fabric": "^7.3.1"`. Grep for `from "fabric"` or
`require("fabric")` returns zero matches. Never imported in source. (Not to be confused with
the `FabricType` enum from Prisma, which is unrelated.)

### 3.4.5 `src/lib/fonts.ts` exports (`inter`, `league`)

**Proof:** Both exports are defined but never imported anywhere (see §3.2.4). The local font
files (`LeagueSpartan-Bold.ttf`, `LeagueSpartan-SemiBold.ttf`) are only referenced by
`fonts.ts`.

## 3.5 Summary Table

| Category | Item | File | Evidence |
|---|---|---|---|
| Dead file | `LiveMockupPreview.tsx` | `src/studio/ui/` | Never imported (grep: 0 matches) |
| Dead file | `design-actions.ts` | `src/actions/` | All 3 exports never imported |
| Dead file | `nanobanana copy/route.ts` | `app/api/mockups/` | Space in dir name; broken `geminiError` ref |
| Dead file | `nanobanana.zip` | `app/api/mockups/` | Binary artifact, never referenced |
| Dead file | `proxy.ts` | project root | Never imported, no middleware.ts |
| Dead exports | `MockupInput`, `clearPrintMockupFromDraft`, `clearAiMockupFromDraft`, `getDraftAiMockupUrl` | `src/db/mockup.ts` | Grep shows definitions only |
| Dead exports | `createBuildForUser`, `getBuildWithDraft`, `renameBuild` | `src/db/builds.ts` | Grep shows definitions only |
| Dead exports | `looksLikeAllowedMockup`, `normalizeMockupMimeType` | `src/lib/storage.ts` | Internal use only |
| Dead exports | `inter`, `league` | `src/lib/fonts.ts` | Grep for `from "src/lib/fonts"`: 0 matches |
| Dead exports | `TRANSFORM_BOUNDS`, `ResolvedPlacement` | `src/studio/render/transform.ts` | Internal use only |
| Dead prop | `projectName` | `StudioNavbar.tsx:16` | Declared in type, never destructured or read |
| Dead state | Checkout modal flow (`showCheckout`, `checkoutAfterAuth`, `handleCheckoutSubmit`, etc.) | `BuilderClient.tsx` | `openCheckout` redirects instead; `checkoutAfterAuth` never set to `true` |
| Dead component | `CheckoutModal.tsx` | `src/studio/ui/modals/` | Only rendered behind unreachable `showCheckout` gate |
| Unused deps | `three`, `@react-three/fiber`, `@react-three/drei`, `fabric` | `package.json` | Grep: 0 import matches |
| Metadata files | 9 × `.DS_Store` | various | `.gitignore` already ignores them |

---

*End of Part 1. Parts 2–5 (Duplicate Logic, Oversized Files, Component Violations, Service Layer Audit, API Audit, Database Audit, Rendering Pipeline Audit, State Management Audit, Performance Audit, Dependency Audit, Safe Delete List, Must Never Touch, Cleanup Roadmap) will be provided in subsequent documents.*
