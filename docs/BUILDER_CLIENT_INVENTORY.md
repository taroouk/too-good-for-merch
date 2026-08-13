# Builder Client Inventory

**File:** `src/studio/ui/BuilderClient.tsx`
**Date:** 2026-08-06
**Lines:** 1,353
**Type:** `"use client"` React component
**Scope:** Pure factual inventory. No opinions, recommendations, or refactoring suggestions.

---

# 1. Imports

## React
- `useEffect` from `react` (line 3)
- `useMemo` from `react` (line 3)
- `useRef` from `react` (line 3)
- `useState` from `react` (line 3)
- `useTransition` from `react` (line 3)
- `ChangeEvent` type from `react` (line 4)
- `CSSProperties` type from `react` (line 5)
- `PointerEvent` as `ReactPointerEvent` type from `react` (line 6)

## React DOM
- `createPortal` from `react-dom` (line 9)

## Third-party
- `* as htmlToImage` from `html-to-image` (line 10)
- `signIn` from `next-auth/react` (line 11)
- `useSession` from `next-auth/react` (line 11)
- `useRouter` from `next/navigation` (line 12)

## Prisma
- `BuildDraft` type from `@prisma/client` (line 13)
- `FabricType` type from `@prisma/client` (line 14)
- `GarmentColor` type from `@prisma/client` (line 15)
- `ProductType` type from `@prisma/client` (line 16)

## Internal — Actions
- `actionUpdateDraft` from `src/actions/build-actions` (line 20)
- `actionAttachExistingAsset` from `src/actions/asset-actions` (line 22)
- `actionCreateAssetForBuilder` from `src/actions/asset-actions` (line 23)

## Internal — Data
- `computeMockupFingerprint` from `src/db/mockup` (line 25)

## Internal — Libraries
- `WHATSAPP_URL` from `src/lib/whatsapp` (line 26)

## Internal — Pricing
- `placementsFromCustomNotes` from `src/pricing/placements` (line 28)
- `upsertPlacementsInNotes` from `src/pricing/placements` (line 29)
- `PlacementKey` type from `src/pricing/placements` (line 30)

## Internal — UI Components
- `CheckoutButton` from `src/studio/ui/components/CheckoutButton` (line 32)
- `ColorSelector` from `src/studio/ui/components/ColorSelector` (line 33)
- `FabricSelector` from `src/studio/ui/components/FabricSelector` (line 34)
- `PriceCard` from `src/studio/ui/components/PriceCard` (line 35)
- `ProductSelector` from `src/studio/ui/components/ProductSelector` (line 36)
- `QuantitySelector` from `src/studio/ui/components/QuantitySelector` (line 37)
- `ArtworkModal` from `src/studio/ui/modals/ArtworkModal` (line 38)
- `AuthModal` from `src/studio/ui/modals/AuthModal` (line 39)
- `BespokeModal` from `src/studio/ui/modals/BespokeModal` (line 40)
- `CheckoutModal` from `src/studio/ui/modals/CheckoutModal` (line 41)
- `TryOn3DPreview` from `src/studio/ui/TryOn3DPreview` (line 42)

---

# 2. Exports

- `BuilderClient` as default export (line 158)

No named exports.

---

# 3. Local State Inventory

## useState (24 declarations)

| # | Name | Type | Initial Value | Line |
|---|---|---|---|---|
| 1 | `mounted` | `boolean` | `false` | 171 |
| 2 | `isPending` | `boolean` | (from `useTransition`) | 172 |
| 3 | `state` | `DraftDTO` | `{...draft, product:"FITTED", color:"WHITE", fabric:"ESSENTIALS_170", quantity:1}` | 174–180 |
| 4 | `selectedPlacements` | `PlacementKey[]` | `placementsFromCustomNotes(draft.customNotes)` | 182–184 |
| 5 | `activePlacement` | `PlacementKey` | `"CENTER_FRONT"` | 185 |
| 6 | `userAssets` | `UserAssetDTO[]` | `initialUserAssets` | 186 |
| 7 | `uploadName` | `string` | `""` | 187 |
| 8 | `artworkUrl` | `string | null` | `null` | 188 |
| 9 | `artworkTransform` | `ArtworkTransform` | `{x:0, y:0, scale:1}` | 189–191 |
| 10 | `generatedMockupUrl` | `string | null` | `initialAiMockupUrl` | 192–194 |
| 11 | `printMockupUrl` | `string | null` | `initialMockupUrl` | 195–197 |
| 12 | `persistedFingerprint` | `string | null` | `initialMockupFingerprint` | 198–200 |
| 13 | `mockupPending` | `boolean` | `false` | 201 |
| 14 | `mockupError` | `string | null` | `null` | 202 |
| 15 | `showAuthModal` | `boolean` | `false` | 203 |
| 16 | `authMode` | `"login" | "signup"` | `"login"` | 204 |
| 17 | `authEmail` | `string` | `""` | 205 |
| 18 | `authPassword` | `string` | `""` | 206 |
| 19 | `authError` | `string | null` | `null` | 207 |
| 20 | `authPending` | `boolean` | `false` | 208 |
| 21 | `showCustomPopup` | `boolean` | `false` | 209 |
| 22 | `showBespokeModal` | `boolean` | `false` | 210 |
| 23 | `attachingAssetId` | `string | null` | `null` | 211 |
| 24 | `selectedSize` | `"S" | "M" | "L" | "XL"` | `"M"` | 212 |
| 25 | `fabricOpen` | `boolean` | `false` | 213 |
| 26 | `price` | `PriceResult | null` | `null` | 214 |
| 27 | `loadingPrice` | `boolean` | `false` | 215 |
| 28 | `isCreatingOrder` | `boolean` | `false` | 216 |
| 29 | `showCheckout` | `boolean` | `false` | 217 |
| 30 | `checkoutAfterAuth` | `boolean` | `false` | 218 |
| 31 | `customerName` | `string` | `""` | 219 |
| 32 | `customerEmail` | `string` | `""` | 220 |
| 33 | `customerPhone` | `string` | `""` | 221 |
| 34 | `paymentMethod` | `"CARD" | "WALLET"` | `"CARD"` | 222 |
| 35 | `checkoutError` | `string | null` | `null` | 223 |
| 36 | `checkoutOrderId` | `string | null` | `null` | 224 |

---

# 4. Refs

| # | Name | Type | Line | Purpose |
|---|---|---|---|---|
| 1 | `fileInputRef` | `HTMLInputElement | null` | 226 | Hidden file input element |
| 2 | `fabricMenuRef` | `HTMLDivElement | null` | 227 | Fabric dropdown container |
| 3 | `dragStateRef` | `{pointerId: number; startX: number; startY: number; origin: ArtworkTransform} | null` | 228–233 | Pointer drag gesture state |
| 4 | `previewRef` | `HTMLDivElement | null` | 235 | html-to-image capture target |

---

# 5. Memoized Values

| # | Name | Type | Dependencies | Line | Purpose |
|---|---|---|---|---|---|
| 1 | `qty` | `number` | `[state.quantity]` | 237 | Clamped quantity |
| 2 | `pricingPlacements` | `PlacementKey[]` | `[selectedPlacements]` | 238–241 | Placements or fallback `["CENTER_FRONT"]` |
| 3 | `fabricOptions` | `Array<{key: FabricType; name: string; gsm: string; desc: string}>` | (none — static) | 243–262 | Fabric option definitions |
| 4 | `placementCards` | `Array<{key: PlacementKey; label: string; image: string}>` | (none — static) | 264–271 | Placement card definitions |
| 5 | `currentFabric` | `{key: FabricType; name: string; gsm: string; desc: string}` | `[state.fabric]` | 273–274 | Active fabric lookup |
| 6 | `currentColorLabel` | `string` | `[state.color]` | 276 | Color display label |
| 7 | `activeArtworkAsset` | `UserAssetDTO | null` | `[artworkUrl, state.primaryAssetId, userAssets]` | 278–284 | Current artwork asset |
| 8 | `liveFingerprint` | `string` | `[artworkTransform, activePlacement, state.primaryAssetId, state.product, state.color]` | 286–299 | Current transform fingerprint |
| 9 | `isMockupStale` | `boolean` | `[persistedFingerprint, liveFingerprint]` | 301–304 | Staleness comparison |
| 10 | `shouldShowGenerateButton` | `boolean` | `[generatedMockupUrl, isMockupStale, state.primaryAssetId, activeArtworkAsset]` | 306–310 | Generate button visibility |
| 11 | `priceText` | `string` | (derived from `loadingPrice`, `state.product`, `price`) | 864–870 | Formatted price display |
| 12 | `selectionSummary` | `string` | (derived from `state.product`, `state.color`, `currentFabric`) | 872–880 | Product/color/fabric summary |
| 13 | `isStandardCheckout` | `boolean` | (derived from `state.product`, `state.color`, `state.fabric`, `price`) | 883–886 | Checkout eligibility |
| 14 | `bespokeArtworkStyle` | `CSSProperties` | `[activePlacement]` | 889–902 | Placement CSS coordinates |
| 15 | `bespokeShirtSrc` | `string` | `[activePlacement, state.color, state.product]` | 904–907 | Garment image path |
| 16 | `bespokeArtworkTransform` | `string` | `[artworkTransform, bespokeArtworkStyle]` | 908–912 | CSS transform string |

---

# 6. Callbacks

All callbacks are plain functions defined inside the component body.

| # | Name | Type | Line | Purpose |
|---|---|---|---|---|
| 1 | `discardGeneratedMockup` | `() => void` | 312 | Clears AI mockup state |
| 2 | `discardPrintMockup` | `() => void` | 318 | Clears print mockup state |
| 3 | `save` | `(next: DraftDTO) => void` | 416 | Updates `state` and calls `actionUpdateDraft` |
| 4 | `handleUpload` | `(file: File) => Promise<void>` | 430 | Upload artwork file |
| 5 | `selectAsset` | `(asset: UserAssetDTO) => Promise<void>` | 496 | Select or attach artwork asset |
| 6 | `removeSelectedArtwork` | `() => void` | 537 | Remove primary artwork |
| 7 | `updateArtworkTransform` | `(next: ArtworkTransform) => void` | 547 | Update transform with clamping |
| 8 | `changeArtworkScale` | `(scale: number) => void` | 557 | Change artwork scale |
| 9 | `resetArtworkTransform` | `() => void` | 564 | Reset transform to default |
| 10 | `handleArtworkPointerDown` | `(event: ReactPointerEvent<HTMLImageElement>) => void` | 568 | Start drag gesture |
| 11 | `handleArtworkPointerMove` | `(event: ReactPointerEvent<HTMLImageElement>) => void` | 580 | Continue drag gesture |
| 12 | `handleArtworkPointerUp` | `(event: ReactPointerEvent<HTMLImageElement>) => void` | 591 | End drag gesture |
| 13 | `openCheckout` | `() => void` | 601 | Initiate checkout (redirect) |
| 14 | `handleCheckoutSubmit` | `(event: React.FormEvent<HTMLFormElement>) => Promise<void>` | 621 | Submit checkout form (deprecated) |
| 15 | `openCustomRequestPopup` | `() => void` | 658 | Open custom request modal |
| 16 | `requestAuth` | `(mode?: AuthMode) => void` | 662 | Open auth modal |
| 17 | `openBespokeBuilder` | `() => void` | 668 | Open bespoke builder modal |
| 18 | `switchAuthMode` | `(mode: AuthMode) => void` | 677 | Switch auth mode |
| 19 | `handleAuthSubmit` | `(event: React.FormEvent<HTMLFormElement>) => Promise<void>` | 682 | Submit auth form |
| 20 | `continueCustomRequest` | `() => void` | 731 | Continue custom request flow |
| 21 | `togglePlacement` | `(key: PlacementKey) => void` | 742 | Toggle placement selection |
| 22 | `selectFittedProduct` | `() => void` | 757 | Select Fitted product |
| 23 | `selectOversizedProduct` | `() => void` | 766 | Select Oversized product |
| 24 | `selectBlackColor` | `() => void` | 775 | Select Black color |
| 25 | `selectWhiteColor` | `() => void` | 784 | Select White color |
| 26 | `toggleFabricMenu` | `() => void` | 793 | Toggle fabric dropdown |
| 27 | `selectFabric` | `(fabric: FabricType) => void` | 797 | Select fabric |
| 28 | `decreaseQuantity` | `() => void` | 807 | Decrease quantity |
| 29 | `increaseQuantity` | `() => void` | 811 | Increase quantity |
| 30 | `handleQuantityChange` | `(event: ChangeEvent<HTMLInputElement>) => void` | 815 | Handle quantity input |
| 31 | `closeAuthModal` | `() => void` | 822 | Close auth modal |
| 32 | `toggleAuthMode` | `() => void` | 827 | Toggle login/signup |
| 33 | `closeCheckoutModal` | `() => void` | 831 | Close checkout modal |
| 34 | `selectCardPayment` | `() => void` | 835 | Select card payment |
| 35 | `selectWalletPayment` | `() => void` | 839 | Select wallet payment |
| 36 | `handleArtworkScaleChange` | `(event: ChangeEvent<HTMLInputElement>) => void` | 843 | Handle scale input |
| 37 | `handlePlacementClick` | `(key: PlacementKey) => void` | 847 | Handle placement click |
| 38 | `saveBespokeTShirt` | `() => void` | 854 | Save bespoke T-shirt |

No `useCallback` wrappers are used. All callbacks are recreated on every render.

---

# 7. Effects

| # | Purpose | Dependencies | Line |
|---|---|---|---|
| 1 | Hydration guard: set `mounted` to `true` after first render | `[]` | 322–324 |
| 2 | Artwork URL sync: if `artworkUrl` is null but `primaryAssetId` is set, find the asset in `userAssets` and set `artworkUrl` | `[artworkUrl, state.primaryAssetId, userAssets]` | 326–334 |
| 3 | Fabric menu outside click: close `fabricOpen` when clicking outside `fabricMenuRef` | `[fabricOpen]` | 336–346 |
| 4 | Price loading: fetch `POST /api/pricing/quote` when product, fabric, quantity, or placements change | `[pricingPlacements, qty, state.fabric, state.product]` | 348–396 |
| 5 | Auth completion: when `status` becomes `"authenticated"` and `showAuthModal` is true, close modal and open BespokeModal or CheckoutModal based on `checkoutAfterAuth` | `[authEmail, checkoutAfterAuth, session?.user?.email, showAuthModal, status]` | 398–410 |
| 6 | Checkout order ID reset: set `checkoutOrderId` to `null` when pricing inputs change | `[pricingPlacements, qty, state.color, state.fabric, state.product]` | 412–414 |

---

# 8. Internal Helper Functions

| # | Name | Type | Line | Purpose |
|---|---|---|---|---|
| 1 | `cn` | `(...parts: Array<string | false | null | undefined>) => string` | 107 | Class name concatenation |
| 2 | `clampQty` | `(qty: number) => number` | 111 | Clamp quantity to [1, 9999] |
| 3 | `clampArtworkScale` | `(scale: number) => number` | 116 | Clamp scale to [0.4, 2.4] |
| 4 | `getBespokeShirtImage` | `(product: ProductType | null, color: GarmentColor | null, placement: PlacementKey) => string` | 121 | Resolve garment image path for bespoke modal |
| 5 | `loadImageElement` | `(src: string) => Promise<HTMLImageElement>` | 140 | Load image element with promise wrapper |
| 6 | `inlineImageFromDataUrl` | `(dataUrl: string) => ReferenceImagePayload` | 149 | Extract base64 data from data URL |
| 7 | `exportMannequinReferenceImage` | `() => Promise<ReferenceImagePayload>` | 914 | Export garment image via Canvas 2D |
| 8 | `exportCompositePreview` | `() => Promise<ReferenceImagePayload>` | 940 | Export composite preview via html-to-image |

---

# 9. Rendered Child Components

## Always Rendered (Main Layout)

| Component | Source | Line | Props Passed |
|---|---|---|---|
| `ProductSelector` | `src/studio/ui/components/ProductSelector.tsx` | 1206 | `product`, `onSelectFitted`, `onSelectOversized`, `onRequestCustom` |
| `ColorSelector` | `src/studio/ui/components/ColorSelector.tsx` | 1213 | `color`, `currentColorLabel`, `customColourIcon`, `onSelectBlack`, `onSelectWhite`, `onRequestCustomColour` |
| `FabricSelector` | `src/studio/ui/components/FabricSelector.tsx` | 1222 | `menuRef`, `currentFabric`, `fabricOptions`, `selectedFabric`, `open`, `onToggleOpen`, `onSelectFabric` |
| `button` (Build Your T-Shirt) | native | 1231 | `onClick={openBespokeBuilder}` |
| `div` (save row) | native | 1239 | `isPending` indicator |
| `TryOn3DPreview` | `src/studio/ui/TryOn3DPreview.tsx` | 1254 | `product`, `color`, `artworkUrl`, `activePlacement`, `artworkTransform`, `generatedMockupUrl`, `isMockupStale` |
| `PriceCard` | `src/studio/ui/components/PriceCard.tsx` | 1266 | `priceText` |
| `QuantitySelector` | `src/studio/ui/components/QuantitySelector.tsx` | 1270 | `quantity`, `onDecrease`, `onQuantityChange`, `onIncrease` |
| `button` (Size Guide) | native | 1284 | no props |
| `div` (size grid) | native | 1289 | `selectedSize`, `setSelectedSize` |
| `div` (summary card) | native | 1306 | `selectionSummary` |
| `CheckoutButton` | `src/studio/ui/components/CheckoutButton.tsx` | 1312 | `onCheckout`, `disabled` |
| `button` (Add To Wishlist) | native | 1317 | disabled, no handler |
| `a` (WhatsApp) | native | 1338 | `href={WHATSAPP_URL}` |

## Conditionally Rendered (Portals)

| Component | Source | Line | Condition | Props Count |
|---|---|---|---|---|
| `AuthModal` | `src/studio/ui/modals/AuthModal.tsx` | 1073 | `mounted && showAuthModal` | 11 |
| `CheckoutModal` | `src/studio/ui/modals/CheckoutModal.tsx` | 1095 | `mounted && showCheckout` | 12 |
| `ArtworkModal` | `src/studio/ui/modals/ArtworkModal.tsx` | 1119 | `mounted && showCustomPopup` | 2 |
| `BespokeModal` | `src/studio/ui/modals/BespokeModal.tsx` | 1132 | `mounted && showBespokeModal` | 24 |

## Hidden Elements

| Element | Line | Purpose |
|---|---|---|
| `input[type="file"]` | 1184–1195 | Hidden file input triggered by BespokeModal |

---

# 10. API Calls

| # | Method | URL | Line | Request Body | Response Handling |
|---|---|---|---|---|---|
| 1 | POST | `/api/pricing/quote` | 355 | `{product, fabric, quantity, placements}` | JSON → `PriceResult` |
| 2 | POST | `/api/auth/register` | 698 | `{email, password}` | JSON → error on failure |
| 3 | POST | `/api/mockups/print` | 1033 | `{buildId, draftId, assetId, placement, x, y, scale, rotation, product, color}` | JSON → `{ok, imageUrl, fingerprint}` |
| 4 | POST | `/api/mockups/nanobanana` | 991 | `{buildId, draftId, assetId, referenceImage, compositeImage, placement, x, y, scale, product, color}` | JSON → `{ok, imageUrl, fingerprint}` |
| 5 | POST | `/api/payments/paymob/create-intent` | 629 | `{orderId OR buildId, customer, method, size, placements}` | JSON → `{paymentUrl}` (deprecated path) |

## Auth Calls (next-auth)

| Call | Line | Purpose |
|---|---|---|
| `signIn("credentials", {redirect: false, email, password, callbackUrl})` | 710 | Login after signup or direct login |

## Navigation Calls (next/navigation)

| Call | Line | Purpose |
|---|---|---|
| `router.push(`/checkout?buildId=${buildId}`)` | 618 | Navigate to checkout page |
| `router.refresh()` | 723 | Refresh router cache after login |

---

# 11. Server Actions

| Action | Source | Line | Arguments | Purpose |
|---|---|---|---|---|
| `actionUpdateDraft` | `src/actions/build-actions.ts` | 427 | `(buildId, FormData)` | Persist draft state |
| `actionCreateAssetForBuilder` | `src/actions/asset-actions.ts` | 464 | `(buildId, FormData)` | Upload artwork |
| `actionAttachExistingAsset` | `src/actions/asset-actions.ts` | 512 | `(buildId, sourceAssetId)` | Copy asset from another build |

All three are invoked via `startTransition()`.

---

# 12. External Modules Used

| Module | Import | Usage |
|---|---|---|
| `react` | `useEffect`, `useMemo`, `useRef`, `useState`, `useTransition`, `ChangeEvent`, `CSSProperties`, `PointerEvent` | React hooks and types |
| `react-dom` | `createPortal` | Modal portals |
| `html-to-image` | `* as htmlToImage` | `htmlToImage.toPng(node, {cacheBust: true, pixelRatio: 3, backgroundColor: undefined})` at line 950 |
| `next-auth/react` | `signIn`, `useSession` | Authentication |
| `next/navigation` | `useRouter` | Navigation |
| `@prisma/client` | `BuildDraft`, `FabricType`, `GarmentColor`, `ProductType` | Type definitions only |
| `@/src/*` (path alias) | Various | Internal imports |

No other external modules are imported directly.

---

# 13. Data Flow

## Props In

| Prop | Type | Source | Line |
|---|---|---|---|
| `buildId` | `string` | Parent page | 159 |
| `draftId` | `string` | Parent page | 160 |
| `draft` | `DraftDTO` | Parent page (from Prisma) | 161 |
| `placementsCount` | `number` | Parent page (computed) | 162 |
| `initialUserAssets` | `UserAssetDTO[]` | Parent page (from Prisma) | 163 |
| `initialMockupUrl` | `string | null` | Parent page (computed) | 164 |
| `initialMockupFingerprint` | `string | null` | Parent page (from Prisma) | 165 |
| `initialAiMockupUrl` | `string | null` | Parent page (computed) | 166 |
| `walletEnabled` | `boolean` | Parent page (from env) | 167 |

## State Out (Server Actions)

| Action | State Written | Server Action | Line |
|---|---|---|---|
| Draft change | `state` (product, color, fabric, quantity, customNotes, primaryAssetId) | `actionUpdateDraft` | 427 |
| Upload artwork | `userAssets` (new asset added) | `actionCreateAssetForBuilder` | 464 |
| Cross-build attach | `userAssets` (copied asset added) | `actionAttachExistingAsset` | 512 |

## State Out (API Calls)

| API | State Written | Line |
|---|---|---|
| `POST /api/pricing/quote` | `price`, `loadingPrice` | 355–369 |
| `POST /api/mockups/print` | `printMockupUrl`, `persistedFingerprint`, `mockupPending`, `mockupError` | 1033–1070 |
| `POST /api/mockups/nanobanana` | `generatedMockupUrl`, `persistedFingerprint`, `mockupPending`, `mockupError` | 991–1020 |

## State Out (Client-only)

| State | Updated By | Trigger |
|---|---|---|
| `artworkUrl` | `handleUpload`, `selectAsset`, `removeSelectedArtwork`, artwork sync effect | User action or mount |
| `artworkTransform` | `updateArtworkTransform` (from drag/scale/reset) | User gesture |
| `selectedPlacements` | `togglePlacement` | User click |
| `activePlacement` | `handlePlacementClick` | User click |
| `mounted` | `useEffect` | After first render |
| Modal states | Various open/close functions | User action or auth completion |

---

# 14. Event Flow

## Upload Flow

1. User triggers file input (line 1189: `onChange` → `handleUpload(file)`)
2. `handleUpload` validates MIME type and size (lines 431–438)
3. Revokes previous blob URL, creates new blob URL (lines 440–441)
4. Resets transform, discards mockups (lines 444–446)
5. Creates optimistic temp asset, adds to `userAssets` (lines 448–455)
6. Calls `actionCreateAssetForBuilder` via `startTransition` (lines 463–493)
7. On success: replaces temp asset with real asset, calls `save()` (lines 465–485)
8. On failure: removes temp asset, restores previous state (lines 486–493)

## Select Artwork Flow

1. User clicks asset in BespokeModal grid → `onSelectAsset(asset)` (line 1171)
2. `selectAsset` revokes previous blob URL, sets new `artworkUrl` (lines 497–498)
3. Resets transform, discards mockups (lines 500–502)
4. If asset belongs to current build: calls `save()` with `primaryAssetId` (lines 504–506)
5. If asset belongs to another build: calls `actionAttachExistingAsset` (lines 509–534)
6. On success: adds copied asset to `userAssets`, calls `save()` (lines 522–529)

## Drag Flow

1. `pointerdown` on artwork → `handleArtworkPointerDown` (line 568)
2. Stores `dragStateRef` with pointer ID, start coordinates, origin transform (lines 571–576)
3. `pointermove` → `handleArtworkPointerMove` (line 580)
4. Computes delta from origin, calls `updateArtworkTransform` (lines 584–588)
5. `pointerup` → `handleArtworkPointerUp` (line 591)
6. Releases pointer capture, clears `dragStateRef` (lines 593–596)

## Scale Flow

1. Three entry points: zoom in button, zoom out button, range input (lines 1165–1167, 843)
2. All call `changeArtworkScale(scale)` (line 557)
3. `changeArtworkScale` calls `updateArtworkTransform` with new scale (lines 558–561)
4. `updateArtworkTransform` clamps scale, rounds x/y, updates state, discards mockups (lines 547–555)

## Placement Flow

1. User clicks placement card → `handlePlacementClick(key)` (line 847)
2. `togglePlacement(key)` adds/removes placement from `selectedPlacements` (lines 742–755)
3. Max 4 placements enforced (line 745)
4. `setActivePlacement(key)` updates active placement (line 849)
5. Mockups discarded (lines 850–851)
6. `save()` persists placements in `customNotes` via `upsertPlacementsInNotes` (lines 751–754)

## Product Flow

1. ProductSelector buttons call `selectFittedProduct`, `selectOversizedProduct`, or `openCustomRequestPopup` (lines 1208–1210)
2. Fitted/Oversized: `save()` with new product, discard mockups (lines 757–763, 766–773)
3. Custom: `openCustomRequestPopup` → `setShowCustomPopup(true)` (line 659)
4. `continueCustomRequest` saves `product: "CUSTOM"` and opens bespoke builder (lines 731–740)

## Color Flow

1. ColorSelector buttons call `selectBlackColor`, `selectWhiteColor`, or `openCustomRequestPopup` (lines 1217–1219)
2. Black/White: `save()` with new color, discard mockups (lines 775–791)

## Print Generation Flow

1. User clicks "Generate Print Mockup" in BespokeModal → `onGeneratePrintMockup` (line 1170)
2. `generatePrintMockup` validates `primaryAssetId` and `activeArtworkAsset` (lines 1024–1027)
3. Sets `mockupPending=true`, `mockupError=null` (lines 1029–1030)
4. POSTs to `/api/mockups/print` with transform and placement data (lines 1033–1048)
5. On success: sets `printMockupUrl` and `persistedFingerprint` (lines 1059–1062)
6. On error: clears `printMockupUrl`, sets `mockupError` (lines 1063–1068)

## AI Generation Flow

1. User clicks "Generate AI Mockup" in BespokeModal → `onGenerateMockup` (line 1169)
2. `generateNanoBananaMockup` validates `primaryAssetId` and `activeArtworkAsset` (lines 965–968)
3. Sets `mockupPending=true`, `mockupError=null` (lines 970–971)
4. Calls `exportMannequinReferenceImage()` (line 974)
   - Loads garment image via `Image()` (line 915)
   - Creates canvas, draws image, returns base64 PNG (lines 924–937)
5. Calls `exportCompositePreview()` (line 975)
   - Gets `previewRef.current` DOM node (line 945)
   - Calls `htmlToImage.toPng(node, {pixelRatio: 3})` (lines 950–954)
   - Returns base64 PNG (lines 956–961)
6. POSTs to `/api/mockups/nanobanana` with both images + transform (lines 977–995)
7. On success: sets `generatedMockupUrl` and `persistedFingerprint` (lines 1007–1010)
8. On error: discards both mockups, sets `mockupError` (lines 1011–1020)

## Checkout Flow (Active)

1. User clicks Checkout button → `openCheckout()` (line 601)
2. Validates price mode, product, fabric, color (lines 602–609)
3. If not authenticated: `setShowAuthModal(true)` (lines 612–614)
4. If authenticated: `router.push('/checkout?buildId=...')` (line 618)
5. Checkout continues at `app/checkout/page.tsx`

## Checkout Flow (Deprecated)

1. `CheckoutModal` rendered via portal when `showCheckout` is true (lines 1095–1117)
2. `showCheckout` is never set to `true` in current code
3. `handleCheckoutSubmit` POSTs to `/api/payments/paymob/create-intent` (lines 621–656)
4. On success: `window.location.replace(paymentUrl)` (line 650)

## Auth Flow

1. User clicks login/signup → `requestAuth(mode)` (line 662)
2. Sets `authMode`, clears `authError`, sets `showAuthModal=true` (lines 663–665)
3. User submits form → `handleAuthSubmit` (line 682)
4. If signup: POST `/api/auth/register` (lines 696–707)
5. Calls `signIn("credentials", ...)` (lines 710–715)
6. On success: closes modal, opens BespokeModal, refreshes router (lines 720–723)
7. On failure: sets `authError` (lines 724–726)

---

# 15. Dependency Graph

```
BuilderClient (src/studio/ui/BuilderClient.tsx)
│
├── React
│   ├── useEffect (6 instances)
│   ├── useMemo (16 instances)
│   ├── useRef (4 instances)
│   ├── useState (24 instances)
│   ├── useTransition (1 instance)
│   ├── ChangeEvent (type)
│   ├── CSSProperties (type)
│   ├── PointerEvent (type)
│   └── createPortal (4 portals)
│
├── react-dom
│   └── createPortal
│
├── html-to-image
│   └── exportCompositePreview
│
├── next-auth/react
│   ├── signIn
│   └── useSession
│
├── next/navigation
│   └── useRouter
│
├── @prisma/client
│   ├── BuildDraft (type)
│   ├── FabricType (type)
│   ├── GarmentColor (type)
│   └── ProductType (type)
│
├── src/actions/build-actions.ts
│   └── actionUpdateDraft
│
├── src/actions/asset-actions.ts
│   ├── actionCreateAssetForBuilder
│   └── actionAttachExistingAsset
│
├── src/db/mockup.ts
│   └── computeMockupFingerprint
│
├── src/lib/whatsapp.ts
│   └── WHATSAPP_URL
│
├── src/pricing/placements.ts
│   ├── placementsFromCustomNotes
│   ├── upsertPlacementsInNotes
│   └── PlacementKey (type)
│
├── src/studio/ui/components/
│   ├── CheckoutButton
│   ├── ColorSelector
│   ├── FabricSelector
│   ├── PriceCard
│   ├── ProductSelector
│   └── QuantitySelector
│
├── src/studio/ui/modals/
│   ├── ArtworkModal
│   ├── AuthModal
│   ├── BespokeModal
│   └── CheckoutModal
│
└── src/studio/ui/TryOn3DPreview
```

## Runtime Data Dependencies

```
BuilderClient
│
├── Props (from parent page)
│   ├── buildId
│   ├── draftId
│   ├── draft (BuildDraft fields)
│   ├── placementsCount
│   ├── initialUserAssets
│   ├── initialMockupUrl
│   ├── initialMockupFingerprint
│   ├── initialAiMockupUrl
│   └── walletEnabled
│
├── Server Actions (mutations)
│   ├── actionUpdateDraft → Prisma BuildDraft
│   ├── actionCreateAssetForBuilder → Prisma Asset + storage
│   └── actionAttachExistingAsset → Prisma Asset copy
│
├── API Calls (reads/writes)
│   ├── POST /api/pricing/quote → PricingRule, PlacementPricingRule
│   ├── POST /api/mockups/print → Asset.artworkData, Mockup insert
│   ├── POST /api/mockups/nanobanana → Asset.artworkData, Mockup insert, Gemini API
│   └── POST /api/payments/paymob/create-intent → Order, PaymentAttempt (deprecated)
│
├── Session (next-auth)
│   ├── useSession → session user
│   └── signIn → credentials login
│
├── Local State (24 useState)
│   ├── Draft state (state)
│   ├── Artwork state (artworkUrl, artworkTransform, userAssets)
│   ├── Mockup state (printMockupUrl, generatedMockupUrl, persistedFingerprint, mockupPending, mockupError)
│   ├── Auth state (showAuthModal, authMode, authEmail, authPassword, authError, authPending)
│   ├── Modal state (showCustomPopup, showBespokeModal, showCheckout, checkoutAfterAuth)
│   ├── Checkout state (selectedSize, customerName, customerEmail, customerPhone, paymentMethod, checkoutError, checkoutOrderId, isCreatingOrder)
│   └── UI state (mounted, isPending, fabricOpen, attachingAssetId)
│
└── Derived State (16 useMemo)
    ├── qty, pricingPlacements
    ├── fabricOptions, placementCards
    ├── currentFabric, currentColorLabel
    ├── activeArtworkAsset
    ├── liveFingerprint, isMockupStale, shouldShowGenerateButton
    ├── priceText, selectionSummary, isStandardCheckout
    └── bespokeArtworkStyle, bespokeShirtSrc, bespokeArtworkTransform
```

---

*End of inventory. All data extracted directly from `src/studio/ui/BuilderClient.tsx` lines 1–1353.*
