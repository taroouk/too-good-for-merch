# TGFM Studio Feedback: Master Checklist (browser QA, 6 Nov 2026)

Environment: isolated copy, Fake Prisma, Network Guard + OS sandbox, Turbopack, Gemini and Paymob NOT configured. Desktop pane unless noted.
Legend: V = implemented and browser-verified, P = implemented, partly verified, B = blocked by external input, F = failing (none proven), N = not implemented.

| # | Item | Status | Files | Evidence / gap |
|---|---|---|---|---|
| 1.1 | Instant price on size change | V | BuilderClient.tsx | 40 rapid size clicks: no "Calculating", buttons never disabled |
| 1.2 | EGP everywhere | V | pricing/display.ts | Studio, Bag, Orders, order pages, Checkout show EGP; no $ found |
| 1.3 | Whole-number prices / fixed list | P + B | pricing/currency.ts | EGP 401/477/497/495 whole; fixed price list missing (owner) |
| 1.4 | Quantity starts at 1 | V | app/studio/page.tsx | new build = 1; quantity 500 persisted, /studio re-entry gave 1 |
| 1.5 | Fabric list text size | P | globals.css | list name 16px, description 14px; box main line 18px (minor gap) |
| 1.6 | Real back photo | B | n/a | needs photographer |
| 1.7 | Product info line | P | BuilderClient.tsx | 170 and 200 GSM verified; 300 not exercised |
| 2.1 | Bespoke copy | V | ArtworkModal.tsx | exact copy seen |
| 2.2 | Bespoke opens WhatsApp | V (decision 8 Nov) | BuilderClient.tsx, lib/contact.ts | opens wa.me in a new tab with the short text "Hi TGFM, I'd like a quote for a bespoke piece" only (no product, colour, fabric, size or quantity, by decision); number 201118399923 kept until confirmed |
| 3.1 | Sharp placement buttons | V | public/images/placements/*.svg | SVG files rendered |
| 3.2 | One-line Place it card | V | BespokeModal.tsx | screenshot |
| 3.3 | Upload/place does not break | P | BuilderClient.tsx | upload and Place it fine, no broken image; pointer drag not exercised |
| 3.4 | Stays on front | V | BuilderClient.tsx | stays front after upload/place; Full Back not clicked |
| 3.5 | Image locked in frame | P | BespokeModal.tsx, composite.ts | Center Front max zoom clipped at frame; Right Chest zoom not tested |
| 3.6 | New design blank | P | BuilderClient.tsx, BespokeModal.tsx | "Continue your last design?" seen; empty state shows a landscape placeholder image, not an empty dashed frame (decision) |
| 4.1 | Mockup flow | P | BuilderClient.tsx | popup closes, "Creating your preview…", friendly error + TRY AGAIN verified; success needs real Gemini (not testable) |
| 4.2 | No technical errors | V | nanobanana/route.ts | friendly text only; technical line only in server log |
| 4.3 | Quote message only for Bespoke | V | BuilderClient.tsx | Bespoke then Oversized: price + Add to Bag |
| 5.1 | Bag new design | V | app/bag/page.tsx | screenshot |
| 5.2 | Same card | V | ProductCard.tsx | 371px wide on all three; heights follow content (1007 to 1044) |
| 5.3 | Order wording | V | lib/orders/customer-view.ts | all 6 statuses and subtitle exact on list and detail pages |
| 6.1 | Country arrow spacing | V | globals.css | screenshot |
| 6.2 | No dollar line | V | checkout/page.tsx | none on checkout or order pages |
| 6.3 | Compact Paymob form | B | n/a | owner: Paymob iframe id |
| 7.1 | Buy Now | P | BuilderClient.tsx | full-width button verified; with a design it stops at the retry message when mockup generation fails (by design); success path and signed-out resume not run |
| 7.2 | Wishlist saves full design | V | wishlist-actions.ts | Open in Studio created a new build with the artwork, black Fitted, size M |
| 8.1 | Correct photo | P | lib/mockup-preview.ts | plain garment in right cut/colour on Bag, Orders, Checkout; matching-mockup case not shown |
| 8.2 | Left/Right Chest | B | placements.ts | Right Chest renders on the screen-right (as in the complaint); production to confirm |
| 8.3 | One checkout for the whole bag | V (decision 8 Nov, isolated) | app/bag/page.tsx, app/checkout/page.tsx, api/bag/quote, lib/orders/cart-checkout.ts, totals.ts, create-intent route, bag-server.ts, orders pages, admin order page | one Checkout and one payment for the bag; real Paymob never contacted (see report) |
| 8.4 | One menu/name | V | nav-model.ts | Home, Studio, Bag checked |
| 8.5 | One upload panel | P | BespokeModal.tsx | after placing: SELECTED ARTWORK (layers) plus YOUR UPLOADS both show |
| 8.6 | Button style | P | globals.css | identical at wide desktop; at about 800px Build/Buy are 14px/2.24px vs 15px/3px |

Other checks: login/session JWT, guest build and cookie, ownership 403/redirects (incl. other user's asset and mockups), Gemini unset gives friendly error with 0 guard violations, 375px Studio renders.
Not run: payment initiation (FAKE_UNSUPPORTED: route.ts:205 raw `SELECT ... FROM "Order" ... FOR UPDATE`; checkout-failure.ts:21 adminAuditLog.create), crop, Full Back, Bag edit/remove, wishlist remove, mobile Bag/Checkout.

## Update 7 Nov 2026 (decisions applied, browser-verified)
- 2.2 (superseded 8 Nov) the extended message was reverted: the text is the short quote request only.
- 3.6 Empty design shows an empty dashed frame (no placeholder image). Verified on a black shirt.
- 7.1 Buy Now already refuses to continue when the mockup fails: stays on the Studio with the design intact and a retry message (verified twice in a row). Success path still needs real Gemini.
- 1.5 Fabric list names 18px (desc 14px) at 800px and desktop.
- 8.6 Product, Build and Buy buttons are 15px / 3px at 375, 800, 1024 and desktop.
- 8.5 One panel: "Your Uploads" only; uploads on the shirt show their placement and a remove-from-shirt action.
- Payment path (isolated, Fake Prisma, Paymob not configured): see report; 16 of 16 checks pass.

## Update 8 Nov 2026 (decisions applied)
- 8.3 One checkout, one payment for the whole bag. Server-side bag is the only source (no client prices/items). One Order with N OrderItems (each records its buildId, size, design signature and mockups); line prices are whole pounds and add up to the subtotal; tax is on the summed subtotal and shipping is charged once; the total is the single amount Paymob would be asked for. Verified in the isolated environment: quote and bag page totals (EGP 1,938 for three items, equal to the sum of the three independent single-build quotes), one order for three items, no duplicate on resubmit / retry / two simultaneous submits, a changed quantity gives a different order (EGP 3,179), payment failure keeps the bag, simulated success empties it and the order reads "Confirmed", empty bag refused, other user's order invisible. Single-build Buy Now checkout is unchanged. Success is simulated in the isolated copy only (no Paymob webhook).
- 2.2 WhatsApp stays short (quote request only); the number is unchanged pending confirmation.

## Production Readiness register, 8 Nov 2026 (Phase 1 re-verification; earlier tables above are kept unchanged)
Source of numbering and text: `TGFM Studio Feedback.pdf` (23 pages). The PDF checklist has **32 items** (not 27): 1.1-1.7 (7), 2.1-2.2 (2), 3.1-3.6 (6), 4.1-4.3 (3), 5.1-5.3 (3), 6.1-6.3 (3), 7.1-7.2 (2), 8.1-8.6 (6).
Status words: DONE = behaviour tested; PARTIAL; BLOCKED = needs an input/approval; NOT VERIFIED = no sufficient test run.

### Runs this session (isolated copy, Fake Prisma, port 3100; Gemini/Paymob not configured)
- `npx tsc --noEmit`: clean. `npx eslint .`: 0 errors, 17 warnings.
- `node scripts/run-payments-tests.mjs`: 342 passed, 0 failed. `node scripts/run-render-tests.mjs`: 386 passed, 0 failed.
- `node --test scripts/isolation/__tests__/*.test.mjs`: 135 tests, 135 pass, 0 fail, 0 skipped, 0 cancelled.
- Server: `node scripts/isolation/run-isolated.mjs --fake-prisma --qa-routes --os-sandbox -- node node_modules/next/dist/bin/next dev -p 3100`; stopped and temp copy removed afterwards.

### Code text check, 2.1/2.2 (expected = PDF; found = code)
| Text | Found at | Match |
|---|---|---|
| Small line "MADE FOR YOU" | ArtworkModal.tsx:42 "Made for you" (CSS uppercases it) | yes |
| Heading "CUSTOM GARMENT REQUEST" | ArtworkModal.tsx:44 "Custom Garment Request" | yes |
| "Custom cuts and constructions are quoted individually. Send us your idea on WhatsApp and we'll come back with a tailored quote." | ArtworkModal.tsx:47-48 (split across two lines in JSX) | yes |
| "CONTINUE ON WHATSAPP" / "GO BACK" | ArtworkModal.tsx:56 / :66 | yes |
| old "TGFM BESPOKE", "CONTINUE WITH CUSTOM REQUEST" | not found | removed |
| WhatsApp message | BuilderClient.tsx:1568 "Hi TGFM, I'd like a quote for a bespoke piece" | **differs from PDF example by decision 8 Nov** (PDF listed colour/fabric/size/quantity) |
| "Custom garments require a tailored quote." | engine.ts:62, BuilderClient.tsx:1947 | shown only in Bespoke (4.3) |
| "Incl. VAT. Ships in 3-5 business days." | PriceCard.tsx:29, overridable note | not shown for Bespoke (per 7 Nov browser check) |

### Browser re-verification this session (built-in browser, isolated, port 3100)
- 1.7: Oversized, Essentials/Signature/Heavyweight show "100% cotton, 170 / 200 / 300 GSM, printed to order just for you." Prices EGP 420 / 497 / 621.
- 1.5: open list names 18px, descriptions 14px; selected box GSM line 18px, description 14px, small name label 12px. Same sizes for all three fabrics. **Difference from PDF:** Fitted offers only Essentials and Signature (Heavyweight hidden by existing code, BuilderClient.tsx:~502, because no Fitted/Heavyweight price exists). The PDF lists three fabrics; needs your decision.
- 8.5: the dialog shows one upload panel, "YOUR UPLOADS" (grid), no "+ADD" / "SELECTED ARTWORK" panel. Which variant the PDF wants is not stated ("keep one"); the grid matches the PDF screenshots.
- 3.3 / 3.4 / 3.5 (Right Chest, 1357px desktop): file upload (via script-injected PNG; native file picker not exercised) shows the real image; Right Chest frame is on the screen-right; pointer drag moved the image; Place it put it in the frame and the view stayed on the front; zoom to max (2.4) clipped at the frame; pointer drag inside the frame moved the picture within the fixed frame; Crop (edge handle drag, Done) produced a cropped copy and the shirt showed it; SAVE T-SHIRT closed the dialog, showed "Creating your preview…", then "We couldn't create your preview. Please try again." + TRY AGAIN (Gemini not configured, expected); after reload the design (cropped art at Right Chest) was still on the model.
- Not exercised: native drag-and-drop of a file from the OS, touch drag, Full Back, mobile sizes this session.

### Register (status after this session)
| # | Status | Evidence | Needs |
|---|---|---|---|
| 1.1 | DONE | 40 rapid size clicks (7 Nov) | |
| 1.2 | DONE | EGP on Studio/Bag/Orders/Checkout (7 Nov) | |
| 1.3 | PARTIAL / BLOCKED | whole pounds; still converted from USD | final EGP price list |
| 1.4 | DONE | new build = 1 (7 Nov) | |
| 1.5 | PARTIAL | 18/14px for 3 fabrics on Oversized, 2 on Fitted | decision: show Heavyweight for Fitted? |
| 1.6 | BLOCKED | | real back photo |
| 1.7 | DONE | 170/200/300 verified 8 Nov | |
| 2.1 | DONE | code text match + browser (7 Nov) | |
| 2.2 | DONE (decision) | opens wa.me with short text | confirm WhatsApp number |
| 3.1 | DONE | SVG files | |
| 3.2 | DONE | one-line card seen 8 Nov | |
| 3.3 | PARTIAL | upload/place/crop/save OK; OS file drag-and-drop and mobile not run | |
| 3.4 | DONE | stays on front 8 Nov; Full Back click not run | |
| 3.5 | DONE (Right Chest, desktop) | zoom clip + pointer drag 8 Nov; other placements/touch not run | |
| 3.6 | PARTIAL | blank frame and "Continue your last design?" (7 Nov) | |
| 4.1 | PARTIAL | failure path verified; success path needs real Gemini | Gemini test |
| 4.2 | DONE | no top_k; friendly text | |
| 4.3 | DONE | 7 Nov | |
| 5.1 | DONE | | |
| 5.2 | DONE | | |
| 5.3 | DONE | | |
| 6.1 | DONE | | |
| 6.2 | DONE | | |
| 6.3 | BLOCKED | | Paymob iframe |
| 7.1 | PARTIAL | success path not run | real Gemini |
| 7.2 | DONE | 7 Nov | |
| 8.1 | PARTIAL | matching-mockup case not shown | |
| 8.2 | BLOCKED | | production confirmation |
| 8.3 | DONE (isolated only) | needs PostgreSQL/Paymob proof | |
| 8.4 | DONE | | |
| 8.5 | DONE (grid variant) | seen 8 Nov | confirm variant |
| 8.6 | PARTIAL | 15px/3px at 375/800/1024/desktop (7 Nov), not re-run | |

## Closure plan for PARTIAL / BLOCKED items, 8 Nov 2026 (planning only; no code changed)
Evidence base: the register above, `src/pricing/defaults.ts`, `src/pricing/engine.ts`, `src/pricing/currency.ts`, `src/pricing/display.ts`. Original item text is as in the PDF (see the numbering note above).

### A. Safe to close locally (code + isolated tests/browser; no external service)
| # | PDF text (short) | Why not complete | Current evidence | Needed | Acceptance test |
|---|---|---|---|---|---|
| 1.5 | Fabric menu text same size as selected box | verified for 3 fabrics on Oversized, 2 on Fitted; PDF names three | list names/desc 18/14px; box GSM line 18px, desc 14px | none in code if Fitted keeps two fabrics; re-measure at 375/800/1024 | computed font-size of every option row equals the selected box's, per fabric and per viewport |
| 3.3 | Dragging must place the real image; broken uploads never appear | OS file drag-and-drop, touch, mobile not run | upload, place, crop, save, reload verified on desktop | browser run of file drop (DataTransfer/real drop), 375px touch drag, failing upload (corrupt PNG) | no broken image anywhere; corrupt file shows "This image couldn't be uploaded. Please try a PNG or JPG." and leaves no tile |
| 3.5 | Image locked inside frame when zooming | only Right Chest, desktop | clip at max zoom and in-frame drag OK | repeat for the other 5 placements and touch | at min/max zoom the artwork never paints outside the dashed frame, for every placement |
| 3.6 | New designs start blank | blank frame and "Continue your last design?" seen once | 7 Nov browser | run all 3 branches: new build, colour/size/fabric change keeps design, return later asks Continue / Start fresh | each branch behaves as in the PDF text |
| 8.1 | Customer's own mockup on Bag/Wishlist/Orders/Checkout | "matching mockup" case never shown (needs a mockup image) | plain garment fallback verified | seed a matching mockup row in the isolated copy (QA route) and a stale one | matching mockup shown; stale/mismatched colour or cut falls back to plain garment of the right colour and cut |
| 8.6 | BUILD YOUR T-SHIRT button style matches | not re-run this session | 15px/3px at 4 widths (7 Nov) | re-measure | computed font-size/letter-spacing/transform of Build, Buy and product buttons identical at 375/800/1024/1357 |
| 3.4 | Stays on front until Full Back chosen | Full Back click not run | stays front after upload/place | click Full Back, then another placement | view switches to back only after Full Back, returns to front after choosing a front placement |

### B. Need a decision or data from the owner
| # | PDF text (short) | Why | Needed from owner | Acceptance test (once provided) |
|---|---|---|---|---|
| 1.3 | Whole-number prices from a fixed EGP price list | still converted USD x rate (50) and rounded; no EGP list exists in code | final EGP price per product x fabric x quantity range (+ placement surcharges) | every displayed price equals the list entry; changing the exchange rate does not change any price; unit test enumerates all combinations |
| 1.5 / pricing | Fitted shows two fabrics; PDF lists three | Fitted + Heavyweight 300 has no price (`FALLBACK_PRICES`, hidden at BuilderClient.tsx ~502) | decide: keep hidden, or supply 10 Fitted/Heavyweight prices | if shown: price present for all 10 ranges, checkout succeeds, admin grid shows it |
| 1.6 | Real photo for back view | asset | real back photo, same model/lighting | back image replaced, no alpha halos, mapping tests (parity/full-back) still pass |
| 8.2 | Left/Right Chest may be swapped | production orientation unknown | production confirmation | chosen side appears on the confirmed side in preview and print composite; test for both |
| 8.5 | One upload panel | PDF says keep one, not which | confirm the grid ("Your Uploads") is the kept version | single panel only |
| WhatsApp | number 201118399923 | unconfirmed | final number (env NEXT_PUBLIC_WHATSAPP_PHONE is a deployment setting, not changed here) | wa.me link uses the confirmed number |

### C. Need a real external service (cannot be proven in the isolated copy)
| # | Item | Needs | Acceptance test |
|---|---|---|---|
| 4.1 | Mockup finishes and shows on Studio | real Gemini (key + model) in a controlled test | design saved, popup closes, "Creating your preview…", then model photo shows the design in the right cut/colour/placement; no technical text; failure path already verified locally |
| 7.1 | Buy Now success path | real Gemini for the mockup step, then Paymob Sandbox | click Buy Now with a design: quantity + every layer saved, current mockup exists, checkout opens; signed-out user logs in and continues |
| 6.3 | Smaller Paymob form | Paymob dashboard iframe/layout + `PAYMOB_IFRAME_ID` | compact card form without card picture or big heading; "Pay EGP N" matches the order total |
| 8.3 | One checkout / one payment for the whole bag | PostgreSQL + Paymob Sandbox | see payment test list below |

### Pricing gaps (from code only; the live DB may hold PricingRule overrides that were not inspected)
- Built-in grid: 10 quantity ranges (1-10 ... 401-500), USD unit prices.
- Fitted: Essentials 170 and Signature 200 priced; **Heavyweight 300 missing (10 of 10 ranges)**.
- Oversized: Essentials 170, Signature 200, Heavyweight 300 all priced (10 of 10 each).
- Bespoke (product CUSTOM): no price by design (quoted individually over WhatsApp); nothing missing.
- Quantity 501+: "bulk" (no price, contact us) by design.
- Placement surcharges: no built-in defaults in code; they come only from `PlacementPricingRule` rows in the DB, so **the current surcharges and any EGP equivalents are unknown here** and need the owner's list.
- Whole pounds today = `Math.round(usdCents x rate / 100)` (display.ts:38, currency.ts:29) with rate 50 in the isolated seed; the production rate was not read.
- Effect of showing Heavyweight for Fitted: today `computePrice` returns "No pricing found" for it, so checkout would fail; it can be exposed only after 10 prices exist (admin grid or code) and the bag/checkout totals tests cover it. Not done.

### Payment tests required before launch (none run against real systems)
PostgreSQL (real): concurrent create-intent for the same bag (one Order, one payment); concurrent webhooks for the same order (no double confirmation; duplicate-design flagging once); row lock on `SELECT ... FOR UPDATE`; migrations apply clean; admin audit/note writes.
Paymob Sandbox: amount units (item `amount_cents` vs order amount in EGP piastres) and that the charged total equals the displayed whole-pound total; `merchant_order_id` reuse/duplicates; payment-link expiry (the 61-minute window assumption, key lifetime 3600 s) with a late payment; real HMAC callback incl. wrong signature/amount/currency; duplicate and out-of-order callbacks; failed/declined card then retry; double payment for the same design (shows "Payment received — under review", no auto refund/cancel). EGP only stays the rule; no integration, unit or webhook change without this evidence.

### Mockups: what needs real Gemini vs local
- Local (already covered/available): placement frames, clipping, composite and preview/print parity (render suite 386 tests), error path and friendly message, "Creating your preview…" state, retry button, ownership checks.
- Needs real Gemini: that `gemini-3.1-flash-image` accepts the current request (top_k already removed), returns an image, the bbox/retry loop terminates within the time budget, the result honours print position on real output, cost and latency. Existing mockup system and cleaned images are not replaced.

## Final execution pass, 8 Nov 2026 (local items executed; old records above kept)
Run in the isolated copy (Fake Prisma, port 3100, Gemini/Paymob not configured); the server was restarted after the code change so the copy contained it.
Limits of this evidence: Fake Prisma does not prove PostgreSQL behaviour; Gemini and Paymob were never contacted; the file picker/drag came from script-injected `File`/`DragEvent`/`PointerEvent` (touch = synthetic touch pointer events, not a physical device).

### Code changes in this pass
- `src/studio/ui/BuilderClient.tsx`: new `uploadFailureMessage()`; a failed or corrupt upload now shows "This image couldn't be uploaded. Please try a PNG or JPG." instead of the raw server sentence "Artwork file content does not match its file type." (3.3). Server-side messages that are already friendly (size, rate limit, pixel size) are kept.
- `src/lib/mockup-preview.ts`: two imports changed from `src/...` to relative paths so the payments test runner can compile it (no behaviour change).
- `scripts/payments-test.tsconfig.json`: includes `mockup-preview.ts`.
- `src/lib/orders/__tests__/mockup-preview.test.ts` (new, 6 tests): matching mockup used; stale colour/cut/artwork falls back to the plain garment of the right cut and colour; order snapshots never record a non-matching mockup (8.1).

### Browser evidence (this pass)
- 3.5 / 3.4: all six placements (Full Front, Center Front, Left Chest, Right Chest, Full Back) get a clip frame equal to their placement frame; art at max zoom is larger than its frame and clipped by it (e.g. Left/Right Chest frame 73x73, art 175x108); Full Back switches the view to the back and a front placement returns to the front; 4-artwork limit message shown at the 5th.
- 3.3: corrupt PNG gives the friendly message and leaves no tile and no broken image; a .txt file gives "Artwork must be PNG, JPG, WEBP, or SVG."; dragging an upload tile onto the shirt (HTML5 drag) places it on the nearest placement (Right Chest) with no broken image; synthetic touch-pointer drag at 375px moved the artwork and `touch-action: none` is set.
- 3.6: "Continue your last design?" appears on a returning visit; Continue restores the 3 layers; Start fresh gives 0 layers, empty frame and UPLOAD ARTWORK; a colour change in the same visit keeps the design and does not re-ask.
- 8.6: Fitted/Oversized/Bespoke/Build/Buy buttons are 15px / 3px / uppercase at 375, 768, 1024 (1357 earlier). ADD TO BAG is 14px / normal spacing (not in the PDF complaint; left as is).
- 1.5: at 375, 768, 1024: open-list names 18px, descriptions 14px, selected box 18px / 14px (small label 12px), no horizontal overflow.

### Final status of the 32 items
DONE: 1.1, 1.2, 1.4, 1.5, 1.7, 2.1, 2.2 (short message, by decision), 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 6.2, 7.2, 8.1 (selection logic unit-tested; fallback browser-seen; a matching mockup file was not rendered because the isolated copy has no mockup image), 8.4, 8.5 (Your Uploads grid, by decision), 8.6, 8.3 (isolated only; PostgreSQL/Paymob proof pending).
BLOCKED - USER INPUT: 1.3 (final EGP price list), 1.6 (back photo), 8.2 (Left/Right Chest orientation).
BLOCKED - EXTERNAL SERVICE: 4.1 (success path needs real Gemini), 6.3 (Paymob iframe), 7.1 (Buy Now success path needs Gemini then Paymob).

## Correction after final review, 8 Nov 2026 (supersedes the status lines of the "Final execution pass" where they differ; nothing above is deleted)
- 3.5 placements: the PDF (3.1/3.5) names FIVE placements: Full Front, Center Front, Left Chest, Right Chest, Full Back. All five were browser-tested for the clip frame (Full Front, Center Front, Left Chest, Right Chest, Full Back) in the previous pass. "Center Back" (a sixth key in code, and in our own status PDF's 3.1 line) is NOT in the original PDF and is no longer offered in the Builder (BuilderClient.tsx placementCards comment), so it cannot be selected in the browser; it is covered only by the render unit tests (placement-config, geometry-parity, layered-render). 3.5 stays DONE for the five PDF placements.
- 8.1 acceptance (PDF: "Always show the customer's own mockup: the right cut, the right colour and their design"): the logic is unit-tested (6 tests, `mockup-preview.test.ts`) and the fallback (plain garment, right cut and colour) was seen in the browser, but a **matching mockup image was never displayed** on Bag/Wishlist/Orders/Checkout (no mockup file exists in the isolated copy and Gemini is not available). Status changed to **PARTIAL**: logic DONE, display NOT VERIFIED. Closing it needs a real mockup (real Gemini) or a QA route that seeds a Mockup row + file in the isolated copy (not built).
- 8.3 split: (a) Checkout logic in the isolated copy (one Order with N items, whole-pound lines summing to the total, no duplicates on resubmit/retry/simultaneous submit, failure keeps bag, simulated success empties it) = DONE in isolation with Fake Prisma, Paymob never contacted; (b) real payment proof on PostgreSQL (row locks, concurrent create-intent and webhooks) and Paymob Sandbox (amount units, expiry, duplicates, real callback) = NOT DONE, EXTERNAL. Overall 8.3 = DONE (isolated logic) + BLOCKED - EXTERNAL SERVICE (payment proof).

### Items that still need input from the owner or an external service
USER INPUT: 1.3 (final EGP price list incl. placement surcharges; Fitted Heavyweight prices only if it should be shown), 1.6 (real back photo), 8.2 (Left/Right Chest orientation), WhatsApp number confirmation.
EXTERNAL SERVICE: 4.1 and 7.1 (real Gemini; 7.1 also Paymob Sandbox), 6.3 (Paymob iframe id), 8.1 display check (real mockup), 8.3 payment proof (PostgreSQL + Paymob Sandbox).

## 8 Nov 2026 (owner report from the live site): placeholder image restored in the empty frame
- Report: on the deployed site the Build dialog's empty print frame showed no placeholder picture. Cause: the 7 Nov change (3.6, "empty dashed frame") removed the Figma placeholder image (`/images/artwork-placeholder.png`, `-2.png` for Center Front).
- Change: `BespokeModal.tsx` keeps the dashed frame and shows the placeholder image inside it again (same files as before, no new assets). Browser-checked in the isolated copy: image loaded (naturalWidth > 0), fills the Center Front frame (189x77 inside 192x80). tsc clean, eslint 0 errors on the file. Not committed/pushed; not yet on the live site.
- 3.6 note: the PDF says "empty dashed frame"; the owner now wants the placeholder inside it. Owner's latest instruction applied.

## 8 Nov 2026 (owner request): "Selected Artwork" section in the Build dialog, max 4
- Change (`BespokeModal.tsx`): a "Selected Artwork (n/4)" section above "Your Uploads" lists every artwork on the shirt (thumbnail, placement label, click to edit, x to remove from the shirt). Empty state: "No artwork on the shirt yet. Up to 4 artworks." The earlier extra tiles for cropped copies inside Your Uploads moved into this section. The limit is the existing `MAX_ARTWORK_LAYERS = 4`.
- Note vs PDF 8.5 ("keep one version only"): this is now the owner's explicit request; Your Uploads stays as the upload library, Selected Artwork shows what is on the shirt.
- Browser evidence (isolated, Fake Prisma): header 0/4 on a fresh design; placing 4 artworks gave 1/4, 2/4, 3/4, 4/4 with labels FULL FRONT, CENTER FRONT, LEFT CHEST, RIGHT CHEST; a 5th placement was refused with "You can add up to 4 artworks. Remove one to add another."; removing one gave 3/4. tsc clean, eslint 0 errors on the file. Not committed or pushed.

## 8 Nov 2026 (owner request): Selected Artwork moved after the colour choice and restyled
- `BespokeModal.tsx` + `app/globals.css`: the section now sits right after "T-Shirt Colour" (before UPLOAD ARTWORK). Header "Selected Artwork" with an "n / 4" pill; a fixed row of 4 square cards (filled = artwork thumbnail, black placement chip at the bottom, round x to remove, black outline on the one being edited; empty = dashed "+" slot); hint text when none. Phone layout gets the same 20px side padding as the colour picker; chip text shrinks under 480px.
- Browser (isolated, Fake Prisma): DOM order colour < selected artwork < upload button; 3 and 4 artworks show 3/4 and 4/4 with 4 cards; at 375px no horizontal overflow, cards 86x86, first card at x=20 like the other sections, no chip text clipped. tsc clean, eslint 0 errors. Not committed or pushed.

## 8 Nov 2026 (owner request): "Creating your preview" moved above the price
- `BuilderClient.tsx` + `app/globals.css`: the status (and the failure message with TRY AGAIN) no longer sits under the Build button on the left; it is a card at the top of the right panel, directly above the price. Pending: spinner, "CREATING YOUR PREVIEW…", "This takes a few seconds. Your design is saved.", and a slim animated bar. Failure: soft red card with the same friendly message and a black TRY AGAIN button. Classes are `studio-mockup-*` (an existing `.studio-preview-status` rule has `display:none`, which hid the first attempt; found and fixed in the browser).
- Browser (isolated, Fake Prisma; Gemini not configured so the failure path is what runs): pending card at y=145, price at y=214 (card above the price); after about 10s the failure card appears at the same spot with TRY AGAIN; at 375px the card is 343px wide, above the price, no horizontal overflow. tsc clean, eslint 0 errors on the file. The success path (mockup shown on the model) still needs real Gemini. Not committed or pushed.

## 8 Nov 2026 (owner request): quality change of the 8 model photos, dimensions re-checked and recalibrated
All 8 files in `public/images` (TGFM/Oversized, White/Black, front/back) were replaced; every size and ratio changed (before -> after, WxH): TGFM White 581x1185 -> 877x1793, TGFM White Back 689x1345 -> 877x1793, TGFM Black 1118x2353 -> 865x1819, TGFM Black Back 683x1439 -> 865x1819, Oversized White 619x1197 -> 902x1744, Oversized White Back 666x1213 -> 902x1743, Oversized Black 646x1205 -> 1024x1536 (ratio 0.536 -> 0.667), Oversized Black Back 716x1310 -> 1024x1536. Background is transparent in all of them.
Before any change 16 of 386 render tests failed (stale sizes/frames); after recalibration 386/386 pass.
Changes: `editor-surface.ts` (TEMPLATE_ASPECTS), `placement-config.ts` (TEMPLATE_FRAMES re-read off 5% grid overlays, FULL_BACK_BOXES re-derived by `assets-work/fullback/derive.mjs`, fallback aspect, reference widths 877 Fitted / 902 Oversized), tests that hard-coded old sizes (`transform`, `editor-surface`, `layered-render` now counts only opaque pixels, `full-back-geometry` measures the body width lower for Oversized Black Back whose armpits are lower), golden snapshot regenerated (intentional: new photos). Tools: `assets-work/newphotos/measure.mjs`, `sheet.mjs` (contact sheets in `assets-work/newphotos/sheets/`).
Found and fixed in the browser: the Studio model preview laid the artwork over a box with the old 0.49 ratio while the new Oversized Black photo is 0.667, so the print appeared at the neck. `TryOn3DPreview.tsx` now puts photo and artwork in one stage with the photo's own ratio (verified: stage ratio 0.667 = photo, print on the chest).
Not changed: output cap `MOCKUP_MAX_SIDE = 2400` (stored mockups are about 1177x2400 for Fitted, so storage size is unchanged although the render is sharper), Gemini input cap 1280. Generate via real Gemini was not run (no key); the print render (same engine that feeds Gemini) was run for all 8 files.

## 8 Nov 2026: Paymob Payment Intention + Unified Checkout added (legacy Accept flow kept as fallback)
See `docs/PAYMOB_INTEGRATION.md` (method choice from the official docs, architecture, env vars, dashboard steps, test steps). Code: `src/lib/payments/paymob.ts` (`paymobFlow`, `createIntentionPayment`, `buildIntentionBody`), `create-intent/route.ts` (`redirect` flag), `app/checkout/page.tsx` (redirect instead of iframe for the intention flow), env checks (`required-production-env.mjs`, `check-production-env.mjs`, `production-readiness.ts`: one complete credential set instead of always the legacy pair). Tests: payments suite 354/0 (6 new), isolated payment-path/audit-fixes (35)/cart-checkout (26)/webhook-seq all PASS. Real Paymob (Test) never contacted: item 6.3 (compact form) is now addressed by the hosted Unified Checkout page, still BLOCKED - EXTERNAL until verified with your test keys; 8.3 payment proof unchanged (PostgreSQL + Paymob test needed). Not committed or pushed.

## 8 Nov 2026 (owner report): the frame on the T-shirt must sit where the placement card shows it
Cause: only Full Back differed clearly. Its frame was derived from the model photo (a square 90% of the body width, top just under the neck), so on the flat tee it started at the collar and was too short, while the Full Back card shows a taller 38 x 44 frame lower on the back. The other placements were close but measured off older cards.
Fix (`placement-config.ts`): every placement's position/size on the torso is now read from the card SVGs themselves (`public/images/placements/*.svg`, torso x 24..76 / y 7..81): Full Front and Center Front x .1346 y .2568 w .7308; Left Chest x .1154, Right Chest x .6154, both w .2692; Full Back x .1346 y .2027 w .7308. Frame shapes: Center Front 38x17, Full Back 38x44, others square (`getPlacementFrameAspect`). The photo-derived `FULL_BACK_BOXES` override was removed, so the flat tee, the model preview and the print all use the same spec. Back torso frames re-centred on each photo's measured body centre.
Tests updated to the card spec (Full Back frame checked as a 38x44 rectangle: >=97% on the garment, above the hem, 0.85-1.0 of the body width), hand-computed numbers in `transform.test.ts`, golden regenerated. Results: render 386/0, payments 354/0, tsc clean. Browser (isolated): Full Back frame h/w 1.158 and higher on the tee than the front frames, Center Front 0.447, chests square, same left/right/top as the cards; contact sheets of the real print on all 8 model photos in `assets-work/newphotos/sheets/` show every print on the garment. Not committed or pushed.
