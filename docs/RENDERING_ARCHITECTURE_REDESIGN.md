# Rendering Architecture Redesign — Technical Design Document

**Project:** Too Good For Merch (print-on-demand platform)
**Author:** Lead Software Architect
**Date:** 2026-07-19
**Status:** Design only — no implementation.

---

## 0. Executive Summary

Testing proved that using Gemini ("Nano Banana") to regenerate customer artwork onto garments causes typography and logo distortion, because generative models **redraw** uploaded graphics instead of compositing them.

The new rendering architecture makes the **customer's uploaded artwork the single source of truth**, pixel-perfect and untouched. Gemini is retained as a client requirement, but its role is narrowed to **AI enhancement only** (e.g. lighting, fabric realism, background, staging) while the artwork pixels are supplied deterministically by our own compositor. The composition (placement of artwork on garment) becomes a first-class, deterministic, reproducible step owned by the application — not by the model.

Gemini must remain in the project (client requirement), but it must **never** be the authority for artwork content or placement geometry.

### 0.1 Two Distinct Mockup Types (canonical distinction)

The system now treats **Print Mockup** and **AI Mockup** as two separate, non-interchangeable preview types. They have distinct generation flows, distinct storage, and distinct APIs. The AI Mockup is **never** allowed to replace, override, or modify the Print Mockup.

| | **Print Mockup** (canonical) | **AI Mockup** (enhanced) |
|---|---|---|
| Authority | Application deterministic compositor | Gemini "Nano Banana" |
| Source of truth | Customer `Asset.artworkData` bytes | Print Mockup output (composite) |
| Determinism | Deterministic, reproducible | Stochastic, non-deterministic |
| Print-accurate | **Yes — used for export & production** | **No — preview/marketing only** |
| Storage | `Mockup` where `kind = "print"` | `Mockup` where `kind = "ai"` |
| API | `POST /api/mockups/print` | `POST /api/mockups/ai` |
| Linked from `BuildDraft` | `printMockupId` (canonical) | `aiMockupId` (optional, secondary) |
| Can modify the other | — | **Never** (read-only consumer of Print Mockup) |

**Invariant:** The Print Mockup is the canonical print preview and the single source of truth. An AI Mockup is a separate preview surface derived from the Print Mockup; it cannot retro-edit the Print Mockup, the artwork, or placement geometry. If the AI service fails or is unavailable, the Print Mockup remains fully usable.

---

## 1. Current Rendering Pipeline

### 1.1 Components (active path)
- **Builder UI:** `src/studio/ui/BuilderClient.tsx` (~1301 lines) — DOM-based editor. Artwork is an `<img>` absolutely positioned over a model `<img>` with CSS `transform: translate(x,y) scale(s)`.
- **Live preview:** `src/studio/ui/TryOn3DPreview.tsx` — renders model image + artwork overlay; placement coordinates are hardcoded CSS tables keyed by `product` + `placement` (`TryOn3DPreview.tsx:102-129`). `mix-blend-mode: multiply` for white garments.
- **Bespoke modal:** `BuilderClient.tsx:856-869` — second, parallel coordinate table (`bespokeArtworkStyle`).
- **Upload:** `src/lib/storage.ts:39` `uploadArtwork()` → stored as `Asset.artworkData` BYTEA in Postgres (migration `20260718120000_store_artwork_in_postgres`). `storageKey` is always `null`.
- **Mockup persistence:** `src/db/mockup.ts` — `computeMockupFingerprint()` (SHA-256 over `assetId|placement|x|y|scale|product|color`), `upsertMockupForDraft()`, `getDraftMockupUrl()`.
- **Gemini integration:** `app/api/mockups/nanobanana/route.ts` (~732 lines) — the **only** Gemini call site.

### 1.2 Data flow (current)
```
User drags/sizes artwork (DOM <img> over model <img>)
   │ click "Generate AI Mockup"
   ▼
BuilderClient.generateNanoBananaMockup()                 [BuilderClient.tsx:931]
   ├─ exportMannequinReferenceImage()  → canvas.toDataURL  (garment PNG)      [BuilderClient.tsx:881]
   ├─ exportCompositePreview()         → html-to-image.toPng(previewRef)     [BuilderClient.tsx:907]
   └─ POST /api/mockups/nanobanana {referenceImage, compositeImage, artwork, transform...}
        │
        ▼
   app/api/mockups/nanobanana/route.ts
      ├─ readArtworkFromAsset() → Postgres Asset.artworkData                [storage.ts:70]
      ├─ POST Gemini /v1beta/interactions (4 inputs: prompt, garment, composite, artwork)  [route.ts:618]
      ├─ parse generated image (very tolerant parsers) → Buffer           [route.ts:305-319]
      ├─ validateMockupData()                                          [storage.ts:107]
      └─ upsertMockupForDraft() → Mockup.data BYTEA + BuildDraft.aiMockupId
        │
        ▼
   BuilderClient shows /api/mockups/{id}/file; TryOn3DPreview swaps model image for the Gemini output.
```

### 1.3 Key facts
- Final visible mockup is **produced by Gemini**, not the client.
- The prompt (`nanoBananaPrompt`, `route.ts:321-375`) already tries to forbid artwork alteration, but empirically the model still distorts typography/logos.
- Storage is **Postgres BYTEA only** — no S3/filesystem in the active path. `storage/artwork/*` on disk is stale.
- `html-to-image` and Canvas 2D are used client-side only to build Gemini inputs; they are **not** the authoritative compositor.
- Orphaned dead code: `src/components/FabricMerchMockup.jsx` (fabric.js), `src/components/DualMockup.tsx`, `src/studio/ui/LiveMockupPreview.tsx`, and unused `three`/`@react-three/fiber`/`drei` deps.

---

## 2. Problems in the Current Architecture

1. **Gemini owns artwork content.** The model receives the original artwork but is asked to *re-render* it into the fabric. Generative redraw = typography/logo distortion. This is the core defect.
2. **Gemini owns placement geometry.** Even though a composite is sent, the model is free to reinterpret position/scale. No deterministic guarantee.
3. **Non-deterministic output.** Same inputs can yield different pixels; the model is a stochastic generator, unsuitable as the source of truth for print-ready artwork.
4. **No pixel-perfect export path.** There is no code path that composites raw artwork at exact device-independent coordinates. The only "final" image is the Gemini JPEG.
5. **Cost & latency on the critical path.** Every mockup requires a 120s-capable Gemini round-trip (`route.ts:656`) even for trivial placement changes.
6. **Tolerant-but-fragile response parsing.** `route.ts:305-319` implements 8+ parser shapes to extract an image — a sign the output contract is uncontrolled.
7. **Dual coordinate tables.** Placement geometry lives in two places (`TryOn3DPreview.tsx:102-129` and `BuilderClient.tsx:856-869`) with different values, risking drift between preview and "truth".
8. **No server-side compositor.** The only server image work is validation + persistence; real compositing happens inside Gemini.
9. **No separation of "render" vs "enhance".** The single endpoint conflates placement, printing, and realistic staging into one generative call.

---

## 3. Proposed Rendering Architecture

Introduce a **deterministic compositor** as the authority for artwork placement, and define **two independent mockup types** with their own generation flows, storage, and APIs.

```
FLOW 1 — PRINT MOCKUP (canonical, deterministic)            [POST /api/mockups/print]
   Inputs:  original Asset.artworkData bytes + garment template + placement record
   Engine:  application compositor (renderer engine abstraction — sharp today, swappable)
   Output:  print-accurate composite PNG  →  Mockup(kind="print")
   Role:    CANONICAL print preview + single source of truth. Used for export/production.

FLOW 2 — AI MOCKUP (Gemini-enhanced, separate preview)      [POST /api/mockups/ai]
   Inputs:  Print Mockup image + garment/environment reference + enhancement prompt
   Engine:  Gemini "Nano Banana"
   Output:  stylized/realistic mockup  →  Mockup(kind="ai", parentId = printMockupId)
   Role:    SEPARATE marketing/preview surface. NEVER replaces/modifies the Print Mockup.
```

**Artwork is the single source of truth.** The Print Mockup flow reads the original `Asset.artworkData` bytes directly and composites them at exact, data-driven coordinates. The output is the **authoritative print artifact** and the canonical print preview.

**The AI Mockup is a distinct type fed by the Print Mockup**, not by the raw artwork alone, and is explicitly scoped to enhancement. It is stored separately (`kind="ai"`) and linked back to its parent Print Mockup via `parentId`. The UI renders it in its own preview pane; it can never write back to the Print Mockup, the artwork, or placement geometry.

### 3.1 Renderer Engine Abstraction (backend-swappable)

The renderer is an **engine abstraction, not a Sharp wrapper**. The Builder and the API must never import a rendering library directly; they depend only on a stable interface, so the backend (Sharp → Canvas → WebGL → Skia) can change without touching them.

**Stable interface** (`src/studio/render/types.ts`):
```
type RenderRequest = {
  artwork: Buffer;            // raw Asset.artworkData bytes (source of truth)
  template: Buffer;          // garment template bytes for (product,color,placement)
  placement: PlacementType;
  transform: { x: number; y: number; scale: number; rotation?: number };
  dpi: number;               // target output resolution
};
type RenderedMockup = { data: Buffer; mimeType: "image/png"; width: number; height: number };

interface MockupRenderer {
  render(req: RenderRequest): Promise<RenderedMockup>;
}
```
- **Engines implement the interface**, each behind the same contract:
  - `src/studio/render/engines/sharp-renderer.ts` — default today.
  - Future: `canvas-renderer.ts`, `webgl-renderer.ts`, `skia-renderer.ts` — drop-in, no caller changes.
- **Single seam point:** a factory `getRenderer()` (`src/studio/render/index.ts`) reads `RENDER_ENGINE` env (default `sharp`) and returns the configured engine. `POST /api/mockups/print` and `BuilderClient` call only `getRenderer().render(...)`.
- **Dependencies inverted:** the API/Builder → `MockupRenderer` interface → engine. Sharp is an *implementation detail of one engine*, never a shared global import.
- **Determinism is part of the contract:** every engine must produce byte-identical output for identical `RenderRequest` (seeded, no RNG, no implicit resampling). A shared golden-image test enforces this across current and future engines, so swapping backends cannot silently change print output.
- **Why this matters:** today Sharp, future Canvas/WebGL/Skia — none of those changes require edits to `BuilderClient.tsx`, `TryOn3DPreview.tsx`, `app/api/mockups/print/route.ts`, or the DB layer. Only a new engine file + env flip.

The live builder preview must also be driven by the **same placement record / coordinate model** as the Print Mockup flow, eliminating the dual-table drift.

---

## 4. Separation of Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| Artwork storage & integrity | `src/lib/storage.ts` + `Asset` model | Untouched, the source of truth. |
| Placement geometry definition | New `Placement` config / `BuildDraft` transform | Single source for client + server. |
| **Print Mockup** generation | **New compositor service** (server) | Deterministic; canonical; `kind="print"`. |
| Print-ready export | **New compositor service** (server) | High-res PNG/PDF from the Print Mockup only. |
| **AI Mockup** generation | Gemini (`/api/mockups/ai`, re-scoped) | Consumes Print Mockup; `kind="ai"`; enhancement only. |
| Mockup persistence | `src/db/mockup.ts` + `Mockup` model | Extended with `kind`, `parentId`, `width`, `height`. Print & AI stored separately. |
| Client preview | `BuilderClient` / `TryOn3DPreview` | Two panes: canonical Print preview + separate AI preview. |

---

## 5. Builder Responsibilities (client)

- Capture and persist the **placement transform** (`x`, `y`, `scale`, `rotation?`) and `activePlacement` into `BuildDraft` (already partially present: `artworkTransform` state).
- Render the **live preview using the same coordinate model** the server compositor uses. No separate hardcoded CSS tables — derive from one shared `placementConfig` module imported by both client and server.
- Generate the **Print Mockup** via `POST /api/mockups/print` to get the pixel-perfect, canonical result immediately. This is the source of truth for preview and export.
- Offer a **separate "Enhance with AI" action** that calls `POST /api/mockups/ai`, producing an AI Mockup shown in its own preview pane. The AI Mockup can never replace the Print Mockup.
- Never trust a Gemini image as the print source. Show the Print Mockup as the canonical "true" preview; show the AI Mockup as a distinct "AI preview" surface.
- Keep upload flow, drag/scale UX, and `previewRef` capture as-is.

---

## 6. Renderer Responsibilities (new deterministic compositor — engine-abstracted)

The renderer is implemented as a **stable `MockupRenderer` interface** with swappable engines (see §3.1). Its responsibilities, independent of which engine runs:

1. Loads original `Asset.artworkData` bytes (never a re-encoded copy).
2. Loads the garment template image (from `/public/images/*` or a managed template store) for the `(product, color, placement)` tuple.
3. Maps `placement` + `transform` → exact pixel coordinates on the template using a **single shared placement-config** (resolution-independent: fractions of template dimensions, not px).
4. Delegates rasterization to the configured engine via `getRenderer().render(RenderRequest)`. The engine places artwork (alpha-aware) onto the template at exact coordinates — **no resampling beyond the requested output resolution, no generative inference**.
5. Emits a print-accurate PNG at the requested DPI/scale (engine returns `{data, mimeType, width, height}`).
6. Is fully deterministic: identical `RenderRequest` → byte-identical output across all engines (seeded, no RNG, no implicit resampling). Enforced by golden-image tests.

This replaces the role Gemini currently plays for placement/printing. It operates on **raw artwork bytes + template**, not a DOM screenshot (avoids CSS rounding). The **default engine is Sharp** (`src/studio/render/engines/sharp-renderer.ts`), selected by `getRenderer()` from `RENDER_ENGINE` env. Canvas/WebGL/Skia are future drop-in engines behind the same interface — no Builder/API changes required.

---

## 7. Gemini Responsibilities (AI Mockup, re-scoped)

Gemini produces the **AI Mockup only** — a distinct, separate preview type. It is **not** the print authority.

- It receives the **Print Mockup image** (the deterministic composite) as the authoritative placement/content input, plus a clean garment/environment reference.
- Prompt must be rewritten to forbid **any** change to artwork content, typography, logo, or placement; its only permitted scope is lighting realism, fabric/ink blending, ambient staging, and background — i.e. "enhancement".
- The AI output is stored as `Mockup` with `kind = "ai"` and `parentId` = the originating Print Mockup id. It is used **only** for its own AI preview surface.
- The Print Mockup (`kind = "print"`) remains the canonical print preview and source of truth, fully independent of whether the AI Mockup succeeds.
- Keep `GEMINI_API_KEY` / `GEMINI_IMAGE_MODEL` usage; keep tolerant parsing defensively, but the system must degrade gracefully — if Gemini fails, the Print Mockup is unaffected (it already exists before the AI call).

---

## 8. Database / Storage Changes

No destructive changes. Additive only. Print and AI mockups are stored in the same `Mockup` table but are **distinguished by a `kind` field** and never overwrite each other.

**New enum `MockupKind`:**
```
enum MockupKind {
  PRINT   // deterministic composite — canonical, print-accurate
  AI      // Gemini-enhanced — separate preview only
}
```

**`Mockup` model** — add:
- `kind MockupKind @default(AI)` — distinguishes Print vs AI mockups. Existing rows are backfilled to `AI` by the migration (they were all Gemini-produced).
- `parentId String?` — for AI mockups, the originating Print Mockup id (FK `Mockup`). Print mockups have `parentId = null`.
- `width Int?`, `height Int?` — rendered dimensions, for export metadata.
- Keep `fingerprint`, `sha256`, `placement`, `model`, `prompt`.

**`BuildDraft` model** — split the single mockup link into two explicit, non-overlapping links:
- `printMockupId String? @map("printMockupId")` — **canonical** link to `Mockup(kind="print")`. This is the print preview / source of truth.
- `printMockupFingerprint String?`, `printMockupGeneratedAt DateTime?` — freshness for the Print Mockup.
- `aiMockupId String? @map("aiMockupId")` — **separate** link to `Mockup(kind="ai")`.
- `aiMockupFingerprint String?`, `aiMockupGeneratedAt DateTime?` — freshness for the AI Mockup.
- The existing `mockupId` / `aiMockupId` / `aiMockupFingerprint` / `aiMockupGeneratedAt` columns are migrated: `mockupId` → `printMockupId`, etc. (migration remaps data; see step 5). To keep the migration simple we may keep the physical column names `aiMockupId` etc. but document the semantic shift — decision recorded in the implementation plan.

**`Asset` model** — no change (already the source of truth). Optionally add `artworkWidth`, `artworkHeight` (extracted at upload) to enable server-side coordinate math without decoding on every render.

**Storage layer** — remains Postgres BYTEA. Both Print and AI mockups store their `data` BYTEA in `Mockup`. Recommend (non-blocking) evaluating an object store (S3/R2) later for large high-res exports; out of scope for this redesign.

**Migration:** additive Prisma migration; backfill existing `Mockup` rows to `kind = "AI"` and remap `BuildDraft.mockupId` → `printMockupId`. No data loss.

---

## 9. Rendering Flow (proposed — two separate flows)

```
=== FLOW 1: PRINT MOCKUP (canonical, deterministic) =========================
User edits placement in BuilderClient
   │ transform persisted to BuildDraft (x, y, scale, placement)
   ▼
Client → POST /api/mockups/print {buildId, draftId, assetId, placement, transform, product, color, dpi}
        │
        ▼
[NEW] src/studio/render/composite.ts   (server)
   ├─ getArtwork(assetId) → raw Asset.artworkData bytes          [storage.ts:70]
   ├─ loadGarmentTemplate(product, color, placement)            [shared placementConfig]
   ├─ map placement+transform → device-independent coords
   ├─ rasterize artwork onto template (sharp / node-canvas) → print PNG
   ├─ validate + upsertMockupForDraft(draftId, {kind:"print", ...})
   └─ return printMockupUrl  →  BuildDraft.printMockupId (CANONICAL)

=== FLOW 2: AI MOCKUP (Gemini-enhanced, separate preview) ==================
User clicks "Enhance with AI" (secondary action; Print Mockup already exists)
   ▼
Client → POST /api/mockups/ai {buildId, draftId, printMockupId, product, color, enhancementPrompt}
        │
        ▼
app/api/mockups/ai/route.ts   (re-scoped nanobanana)
   ├─ load Print Mockup image (BuildDraft.printMockupId)
   ├─ POST Gemini /v1beta/interactions (print mockup + garment ref + enhancement prompt)
   ├─ parse generated image (tolerant parsers) → Buffer
   ├─ validateMockupData()                                          [storage.ts:107]
   ├─ upsertMockupForDraft(draftId, {kind:"ai", parentId: printMockupId, ...})
   └─ return aiMockupUrl  →  BuildDraft.aiMockupId (SEPARATE preview only)

=== EXPORT (from Print Mockup only) =========================================
Client → GET /api/export/{draftId}?dpi=300
   └─ re-render Print Mockup at target resolution (deterministic) → high-res PNG/PDF
```
**Invariant enforced in code:** `POST /api/mockups/ai` is a read-only consumer of the Print Mockup; it writes only to `Mockup(kind="ai")` and `BuildDraft.aiMockupId`. It can never mutate `BuildDraft.printMockupId`, the `Asset`, or placement geometry.

The live `TryOn3DPreview` shows **two panes**: the canonical Print Mockup preview (when a fresh print composite exists) and a separate AI Mockup preview pane. The fast DOM/CSS overlay remains as an in-editor, non-authoritative aid.

---

## 10. High-Resolution Export Strategy

- **Authoritative export = Print Mockup at target DPI**, computed server-side at the requested resolution (e.g. 300 DPI). Because the Print Mockup uses raw artwork bytes (vector/hi-res PNG source) composited onto a hi-res garment template, output fidelity is limited only by source artwork + template resolution — never by Gemini.
- Garment templates must be supplied at print resolution (e.g. ≥3000px on long edge). Currently `/public/images/*.png` are preview-resolution; **a print-resolution template set is required** (separate from preview assets).
- Coordinate model must be resolution-independent (fractions of template dimensions) so the same `transform` yields identical placement at 72 DPI (preview) and 300 DPI (export).
- Export endpoints: `GET /api/mockups/{id}/file` (existing) serves any `Mockup` by id; the **export endpoint re-renders the Print Mockup** (`BuildDraft.printMockupId`) at `?dpi=`, never the AI Mockup.
- Optionally emit PDF/X for production handoff (out of scope for v1, but the compositor design must allow it).
- **AI Mockup (`kind="ai"`) is explicitly excluded from export.** The export path has no code path that accepts an AI Mockup id. If a customer wants the "AI look", document that it is non-print-accurate and export only the Print Mockup.

---

## 11. Performance Considerations

- **Deterministic composite is cheap & fast** vs Gemini: no 120s model call. Expect tens of ms server-side with `sharp`.
- **Generate composite on placement change (debounced)** client-side, or lazily on explicit "Generate". Keep the in-editor DOM preview for instant feedback; use the server composite for the authoritative artifact.
- **Cache by fingerprint.** `computeMockupFingerprint` already exists (`mockup.ts:23`) — reuse it as the cache key for composites. Skip re-render when fingerprint unchanged.
- **Gemini becomes optional/async.** Move AI enhancement off the critical path: render composite synchronously, enhance in the background, swap in when ready.
- **BYTEA size:** high-res composites/PDFs are large; consider offloading to object storage before this scales. For v1, cap export size and warn.
- **Decoding artwork on every render** is wasteful; cache decoded buffers per `assetId`+`dpi` within a request and consider storing `artworkWidth/Height` at upload.

---

## 12. Browser vs Server Rendering

| Stage | Where | Why |
|---|---|---|
| Live editor preview | **Browser** (DOM/CSS) | Instant interaction; non-authoritative. |
| Deterministic composite | **Server** (Node, `sharp`/canvas) | Deterministic, resolution-independent, reproducible, protects source bytes. |
| High-res export | **Server** | Needs print-res templates + exact math; avoid shipping huge templates to client. |
| AI enhancement | **Server** (Gemini API) | API key must stay server-side; client never calls Gemini directly. |

Do **not** composite artwork in the browser for the print artifact (DOM/html-to-image rounding + no raw-byte guarantee). The browser may show a *preview* of the composite via the served image, but the artifact is always server-produced.

---

## 13. Which Existing Code Can Be Reused

- `src/lib/storage.ts` — `getArtwork()`, `uploadArtwork()`, `validateMockupData()`, magic-byte validators. Fully reused; the source of truth.
- `src/db/mockup.ts` — `computeMockupFingerprint()`, `upsertMockupForDraft()`, `getDraftMockupUrl()`. Extend to handle `kind` (`print`/`ai`) and separate `printMockupId`/`aiMockupId` links; don't rewrite.
- `app/api/mockups/[id]/file/route.ts` — serves any `Mockup.data` by id; reused by both Print and AI preview panes.
- `app/api/assets/[assetId]/file/route.ts` — serves raw artwork; reused by compositor.
- `app/api/mockups/nanobanana/route.ts` — **reuse the request validation, auth (`canAccessBuild`), Gemini fetch, image parsing, and persistence glue**; this becomes `app/api/mockups/ai/route.ts`. Replace the prompt with an enhancement-only prompt and feed it the **Print Mockup image** instead of the DOM screenshot + original artwork as separate inputs. It must persist `kind="ai"` and `parentId`, and must NOT touch `printMockupId`/the artwork.
- `BuilderClient.tsx` — reuse upload, drag/scale UX, transform state, `exportMannequinReferenceImage` concept; repurpose `exportCompositePreview` to call the new Print Mockup endpoint; add a separate "Enhance with AI" action that calls the AI endpoint.
- `TryOn3DPreview.tsx` — reuse model-image selection + side switching; drive overlay coordinates from the shared placement-config (remove the hardcoded duplicate table); render two panes (Print + AI).
- Placement enums (`PlacementType`) and product/color enums — reused directly; add new `MockupKind` enum.
- Garment images in `/public/images/*.png` — reused as **preview** templates; a new print-res set is needed for export.

---

## 14. Which Files Should Remain Untouched

- `prisma/schema.prisma` — existing `BuildDraft.aiMockupId` / `aiMockupFingerprint` / `aiMockupGeneratedAt` columns: keep physical names to avoid a rename migration; they now map to the **AI Mockup** link. New `printMockupId` / `printMockupFingerprint` / `printMockupGeneratedAt` columns are added for the **Print Mockup** canonical link (or, if simpler, remap `mockupId`→`printMockupId` in the migration and document it). The semantic split (Print vs AI) is the key change.
- `src/lib/storage.ts` artwork path — the source of truth; do not change storage mechanism.
- `app/api/assets/[assetId]/file/route.ts` — artifact serving unchanged.
- `src/db/mockup.ts` public functions — extend signatures to accept `kind`, don't break callers.
- Auth/payments/orders/admin code — entirely unrelated to rendering (`app/api/orders/*`, `app/api/payments/*`, `app/admin/*`, `src/auth`).
- Orphaned dead code (`FabricMerchMockup.jsx`, `DualMockup.tsx`, `LiveMockupPreview.tsx`) — leave as-is; do not build on them.
- Migration history — additive only; never edit existing migrations.

---

## 15. Step-by-Step Implementation Plan

> Design only. Steps are sequenced for a future implementation phase.
> **Phase1 (agreed scope):** items P1-1 … P1-9 — establish the Print Mockup as canonical with its own flow/storage/API, plus DB split. AI Mockup (P2-*) is a later phase but the schema and invariants must accommodate it from day one.

### Phase 1 Governance (binding rules)

1. **Phase1 must deliver a complete deterministic rendering pipeline before any AI enhancement work begins.**
2. **No Gemini code is modified during Phase1.** `app/api/mockups/nanobanana/route.ts` and its helpers are frozen; the AI Mockup type is reserved in schema/UI but not generated.
3. **Finish Phase1 completely before starting Phase2.** Do not interleave AI work.
4. **Scope discipline:** if improvements are discovered mid-implementation, **document them in §16 (Discovered Improvements)** but do **not** expand scope. They are evaluated for later phases only.

### Phase 1 Acceptance Criteria (must all pass before Phase2)

- **AC1 — Placement fidelity:** the rendered mockup matches the Builder placement exactly (artwork position/scale/rotation identical to the editor's resolved coordinates).
- **AC2 — Pixel preservation:** original artwork pixels are preserved; the renderer composites raw `Asset.artworkData` bytes without redraw/resample beyond the requested output resolution.
- **AC3 — Determinism:** identical `RenderRequest` → byte-identical output (verified by hash; golden-image test).
- **AC4 — Single pipeline for export:** high-resolution export reuses the same rendering pipeline (same `MockupRenderer` + placement-config), only varying `dpi`.
- **AC5 — Builder unchanged:** existing Builder behavior (upload, drag/scale UX, transform state) remains intact; the Print Mockup is additive, not a rewrite.
- **AC6 — Storage & persistence intact:** existing `Asset`/`Mockup` storage and `src/db/mockup.ts` persistence continue to work; new fields are additive.
- **AC7 — Tests green:** all existing tests continue to pass.

### Phase1 — Print Mockup (canonical) + schema split
- **P1-1.** **Define shared placement-config module** (`src/studio/render/placement-config.ts`): resolution-independent coordinates (fractions of template) for every `(ProductType, GarmentColor, PlacementType)` tuple. Single source for client + server. Retire the two hardcoded CSS tables.
- **P1-2.** **Add print-resolution garment templates** to a managed location (separate from `/public/images` preview PNGs); register them in placement-config.
- **P1-3.** **Add renderer engine abstraction** (`src/studio/render/types.ts` `MockupRenderer` interface + `RenderRequest`/`RenderedMockup`; `src/studio/render/index.ts` `getRenderer()` factory reading `RENDER_ENGINE`). Add `sharp` dependency and implement the default `src/studio/render/engines/sharp-renderer.ts`. Builder and API depend only on the interface/factory, never on Sharp directly.
- **P1-4.** **Schema:** add `enum MockupKind { PRINT, AI }`, `Mockup.kind` (+ `parentId`, `width`, `height`), and `BuildDraft.printMockupId`/`printMockupFingerprint`/`printMockupGeneratedAt`. Backfill existing `Mockup` → `kind="AI"` and remap `BuildDraft.mockupId` → `printMockupId` in the migration. (Physical `aiMockupId*` columns kept for the AI link.)
- **P1-5.** **Implement `src/studio/render/composite.ts`** (engine-agnostic orchestrator): load raw artwork bytes + template, map placement+transform → exact coords, call `getRenderer().render(...)`, return `RenderedMockup`. Deterministic, no RNG. Never imports Sharp.
- **P1-6.** **Extend `src/db/mockup.ts`**: `upsertMockupForDraft` gains `kind`/`parentId`/`width`/`height`; add a Print-Mockup upsert path keyed by `computeMockupFingerprint` and writing `BuildDraft.printMockupId`.
- **P1-7.** **Add `POST /api/mockups/print/route.ts`** (Node runtime): validate + auth (mirror `nanobanana`), call compositor, persist `kind="print"`, return URL + `printMockupId`. Use the fingerprint as cache key.
- **P1-8.** **Wire `BuilderClient.tsx`**: call Print endpoint for the canonical preview; keep upload + transform UX; show Print Mockup as the true preview. (AI button added in Phase2.)
- **P1-9.** **Update `TryOn3DPreview.tsx`**: use shared placement-config for overlay; prefer showing the Print Mockup when fresh. Lay out a distinct second pane placeholder for the future AI preview.
- **P1-10.** **Add deterministic + placement-fidelity tests** covering AC1–AC4 (golden-image hash, artwork-bbox vs expected coords, pixel-sampling of artwork region).

### Phase 2 — AI Mockup (separate preview, later — NOT started until Phase1 is complete)
- **P2-1.** **Re-scope `app/api/mockups/nanobanana/route.ts` → `POST /api/mockups/ai/route.ts`**: accept `printMockupId` (+ garment ref); rewrite prompt to enhancement-only; persist `kind="ai"`, `parentId = printMockupId`, write only `BuildDraft.aiMockupId`. Must NOT touch `printMockupId`/artwork. Keep parsers/validation.
- **P2-2.** **Wire `BuilderClient.tsx` "Enhance with AI"** action → AI endpoint; render result in the separate AI preview pane.
- **P2-3.** **High-res export endpoint** (`GET /api/export/{draftId}?dpi=300`) re-renders the **Print Mockup only**; AI Mockup id is rejected. Cap size.

### Cross-phase
- **C-1.** **Cache & perf pass**: skip re-render on unchanged fingerprint; background the AI call (Phase 2); consider `artworkWidth/Height` columns.
- **C-2.** **Validation & tests**: assert pixel-perfect placement (composite artwork bbox vs expected coords), determinism (same input → identical hash), the Print/AI `kind` separation, and that the AI endpoint cannot mutate `printMockupId`/artwork.
- **C-3.** **Docs/migration note**: document the semantic split (Print vs AI), the new `kind` field, and the `printMockupId`/`aiMockupId` link columns.

### Phase 1 delivery criterion
Phase 1 is complete when **all seven acceptance criteria (AC1–AC7) pass** and the Print Mockup is generatable via its own API, stored distinctly (`kind="print"`, linked via `printMockupId`), rendered deterministically from raw artwork bytes, shown as the canonical preview, and exportable at high resolution — with **no Gemini code touched** and **no Phase 2 work started**. The AI Mockup type is reserved in schema and UI but not yet generated.

---

## 16. Discovered Improvements (documented, out of Phase1 scope)

> Any improvement found during Phase 1 implementation is logged here verbatim with a short note. These are **not** implemented in Phase 1 and do not expand its scope; they are candidates for later phases.

---

## Appendix A — Risk Register

| Risk | Mitigation |
|---|---|
| Gemini still distorts when given the Print Mockup | Print Mockup is canonical & print-accurate; AI Mockup is a separate preview type that can never replace it. |
| AI Mockup mistakenly used for export/production | Export path accepts only `printMockupId`; AI Mockup id is rejected. Schema `kind` enforces the split. |
| AI flow overwrites the Print Mockup | Invariant: `POST /api/mockups/ai` writes only `Mockup(kind="ai")` + `BuildDraft.aiMockupId`; code review/test asserts it cannot mutate `printMockupId`. |
| Template resolution too low for export | Add print-res template set (P1-2). |
| BYTEA bloat from hi-res exports | Object storage later; size caps now. |
| Dual coordinate drift | Single shared placement-config (P1-1). |
| Broken Gemini contract | Keep tolerant parsers; degrade — Print Mockup unaffected since it exists before the AI call. |

## Appendix B — Glossary

- **Source of truth:** the customer's original `Asset.artworkData` bytes; never re-encoded by a model.
- **Print Mockup:** the deterministic, canonical, print-accurate composite produced by the application compositor. Stored as `Mockup(kind="print")`, linked via `BuildDraft.printMockupId`. The single source of truth for preview and export.
- **AI Mockup:** a Gemini-enhanced, separate preview type derived from a Print Mockup. Stored as `Mockup(kind="ai", parentId=printMockupId)`, linked via `BuildDraft.aiMockupId`. Never replaces or modifies the Print Mockup.
- **Deterministic compositor:** the application-owned rasterizer that places raw artwork onto a garment template at exact, resolution-independent coordinates.
