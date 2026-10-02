"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type {
  BuildDraft,
  FabricType,
  GarmentColor,
  ProductType,
} from "@prisma/client";

import { actionUpdateDraft, actionSaveArtworkLayers, actionSwitchProduct } from "src/actions/build-actions";
import { actionSaveArtwork } from "src/actions/artwork-actions";
import { actionAddToWishlist } from "src/actions/wishlist-actions";
import {
  actionAttachExistingAsset,
  actionRemoveAsset,
  actionCreateAssetForBuilder,
} from "src/actions/asset-actions";
import {
  MAX_ARTWORK_LAYERS,
  layersForSide,
  sideFingerprint,
  sidesWithLayers,
  type ArtworkLayer,
} from "src/studio/artwork-layers";
import { getPlacementSide } from "src/studio/render/placement-config";
import { getEditorPlacementBox } from "src/studio/render/editor-surface";
import { WHATSAPP_URL } from "src/lib/whatsapp";
// transform.ts and placement-css.ts have zero server-only imports (no
// node:fs, no sharp) -- safe to import directly from a client component.
// Do not import from the src/studio/render barrel (index.ts) here, since
// it also re-exports server-only modules (templates.ts uses
// node:fs/promises).
import {
  artworkOffsetPx,
  BASELINE_RENDER_DPI,
  clampArtworkRotation,
  getDragBounds,
  getEffectiveScaleBounds,
} from "src/studio/render/transform";
import { getBespokeShirtImage } from "src/studio/render/bespoke-shirt-image";
// The Bespoke popup designs on a FLAT tee, while everything outside it
// (the Live Model Preview, the Print Mockup, the Gemini mockup) renders
// onto the photographed-model templates. The stored transform stays in
// template space; these convert it to/from the flat tee's own canvas for
// display and for drag input only. See src/studio/render/editor-surface.ts.
import {
  getEditorPlacementStyle,
  toEditorOffset,
  toTemplateOffset,
} from "src/studio/render/editor-surface";
import { useMeasuredRefCallback } from "src/studio/ui/useContainerSize";
import { useTrimmedArtworkUrl } from "src/studio/ui/useTrimmedArtworkUrl";
import { upsertPlacementsInNotes, type PlacementKey } from "src/pricing/placements";
import CheckoutButton from "src/studio/ui/components/CheckoutButton";
import ColorSelector from "src/studio/ui/components/ColorSelector";
import FabricSelector from "src/studio/ui/components/FabricSelector";
import PriceCard from "src/studio/ui/components/PriceCard";
import ProductSelector from "src/studio/ui/components/ProductSelector";
import QuantitySelector from "src/studio/ui/components/QuantitySelector";
import ArtworkModal from "src/studio/ui/modals/ArtworkModal";
import AuthModal from "src/studio/ui/modals/AuthModal";
import BespokeModal from "src/studio/ui/modals/BespokeModal";
import SizeGuideModal from "src/studio/ui/modals/SizeGuideModal";
import TryOn3DPreview from "src/studio/ui/TryOn3DPreview";

type PriceResult =
  | { mode: "standard"; unit: number; total: number; currency: "USD" | "EGP" }
  | {
      mode: "custom" | "bulk";
      unit: null;
      total: null;
      currency: "USD" | "EGP";
      message: string;
    };

type DraftDTO = Pick<
  BuildDraft,
  "product" | "color" | "fabric" | "quantity" | "customNotes" | "primaryAssetId"
>;

type UserAssetDTO = {
  id: string;
  buildId?: string | null;
  url: string;
  fileName: string;
  // Content hash (Asset.artworkSha256): the same image can exist as several
  // rows (picking an upload from another project copies it), so "Your
  // uploads" dedupes on this rather than on id.
  hash?: string | null;
};

// Moves `asset` to the front of "Your uploads" and drops every other entry
// for the same image (same id, same content hash, or an explicit `alsoDrop`
// id such as the source row an attach just copied from).
function withAssetFirst(list: UserAssetDTO[], asset: UserAssetDTO, alsoDrop?: string): UserAssetDTO[] {
  return [
    asset,
    ...list.filter(
      (item) =>
        item.id !== asset.id &&
        item.id !== alsoDrop &&
        !(asset.hash && item.hash === asset.hash),
    ),
  ];
}

type CreatedAssetDTO = Awaited<ReturnType<typeof actionCreateAssetForBuilder>>;

// One artwork in the design, with what the editor needs to draw it.
type EditorLayer = ArtworkLayer & { url: string; fileName?: string; hash?: string | null };

type BuilderClientProps = {
  buildId: string;
  buildName: string;
  draftId: string;
  draft: DraftDTO;
  placementsCount: number;
  initialUserAssets?: UserAssetDTO[];
  initialMockupUrl?: string | null;
  initialMockupFingerprint?: string | null;
  initialAiMockupUrl?: string | null;
  initialAiMockupFingerprint?: string | null;
  // Admin-set Bespoke/Custom quote (src/actions/admin-bespoke-actions.ts).
  // When set, a product==="CUSTOM" build switches from "Request a Quote"
  // (no-payment intake) to the normal Paymob checkout -- see canCheckout /
  // priceText below. Cleared server-side the moment the draft materially
  // changes (src/actions/build-actions.ts's actionUpdateDraft), so a page
  // refresh always reflects whether it's still valid.
  initialCustomQuoteUsdCents?: number | null;
  initialCustomQuoteNote?: string | null;
  // Canonical persisted artwork the user explicitly SAVEd (Artwork model,
  // src/actions/artwork-actions.ts). URL points at /api/artworks/<id>/file.
  // Survives refresh independent of the Build-scoped aiMockup row.
  initialSavedArtworkUrl?: string | null;
  // Persisted canvas transform { placement, x, y, scale, rotation } from
  // BuildDraft.artworkPlacement -- so the canvas position survives a
  // refresh, not just the image.
  initialArtworkPlacement?: {
    placement?: string | null;
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
  } | null;
  // Whether this build is already in the signed-in user's wishlist.
  initialInWishlist?: boolean;
  // Multi-artwork design (src/studio/artwork-layers.ts) and the back-side
  // mockups (front ones are initialMockup*/initialAiMockup*).
  initialLayers?: EditorLayer[];
  initialBackMockupUrl?: string | null;
  initialBackMockupFingerprint?: string | null;
  initialBackAiMockupUrl?: string | null;
  initialBackAiMockupFingerprint?: string | null;
};

type SizeOption = "S" | "M" | "L" | "XL";
type AuthMode = "login" | "signup";
type ArtworkTransform = {
  x: number;
  y: number;
  scale: number;
  // P3-21c: rotation is fully supported server-side (persisted by
  // src/lib/artwork/save.ts, compared by src/lib/orders/reuse.ts, applied by
  // src/studio/render/composite.ts, hashed into the mockup fingerprint). The
  // client used to hardcode 0 on save, which silently destroyed any persisted
  // rotation on the next save and made the fingerprint disagree with the
  // stored placement. It is carried through here even though there is no
  // rotation control in the UI yet.
  rotation: number;
};

// Inline SVG (vector) palette icon. Was previously a 13x13 raster PNG data
// URI that looked blurry once scaled up inside the ~40px colour swatch,
// especially on high-DPI desktop displays. An SVG stays crisp at any size.
const CUSTOM_COLOUR_ICON =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23111111%22%20stroke-width%3D%221.7%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M12%203.5c-4.7%200-8.5%203.4-8.5%207.9%200%203.6%202.9%206.1%206.2%206.1%201.1%200%201.9-.9%201.9-1.9%200-.5-.2-.9-.2-1.4%200-.9.7-1.6%201.6-1.6h1.8c2.7%200%204.9-2.1%204.9-4.8%200-4.3-3.5-7.8-7.9-7.8Z%22%2F%3E%3Ccircle%20cx%3D%227.6%22%20cy%3D%2210.6%22%20r%3D%221.05%22%2F%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%228%22%20r%3D%221.05%22%2F%3E%3Ccircle%20cx%3D%2216.2%22%20cy%3D%2210.9%22%20r%3D%221.05%22%2F%3E%3C%2Fsvg%3E";
const DEFAULT_ARTWORK_TRANSFORM: ArtworkTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
// A pricing-quote failure is either the rate limit (429) or a transient
// server error (5xx/network) -- both are worth exactly one retry, not an
// unbounded loop. Kept small and bounded per the reliability fix for the
// Checkout button: see the pricing-quote effect below.
const PRICE_QUOTE_MAX_ATTEMPTS = 2;
const PRICE_QUOTE_RETRY_DELAY_MS = 1200;
const ALLOWED_ARTWORK_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/jpg",
  "image/pjpeg",
  "image/pjp",
]);

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clampQty(qty: number) {
  if (!Number.isFinite(qty)) return 1;
  return Math.max(1, Math.min(9999, Math.floor(qty)));
}

// bounds comes from transform.ts's getEffectiveScaleBounds(product, color,
// placement) at every call site below -- never a hardcoded [0.4, 2.4]
// here. That function already IS the server's own per-placement ceiling
// (resolvePlacement calls it too), so the client can never offer a scale
// the server would silently reduce.
function clampArtworkScale(scale: number, bounds: { min: number; max: number }) {
  if (!Number.isFinite(scale)) return Math.max(bounds.min, Math.min(bounds.max, 1));
  return Math.max(bounds.min, Math.min(bounds.max, scale));
}

// Keeps dragged artwork inside the visible shirt canvas -- see
// getDragBounds's own comment in transform.ts for why this is an
// approximation (square artwork assumption) rather than exact garment-
// silhouette geometry.
function clampArtworkPosition(
  x: number,
  y: number,
  bounds: { x: { min: number; max: number }; y: { min: number; max: number } },
) {
  return {
    x: Number.isFinite(x) ? Math.max(bounds.x.min, Math.min(bounds.x.max, x)) : 0,
    y: Number.isFinite(y) ? Math.max(bounds.y.min, Math.min(bounds.y.max, y)) : 0,
  };
}

// Bespoke ("CUSTOM") has no product/colour of its own yet -- that's the
// whole point of it being a tailored request. The print/AI mockup routes
// only know the FITTED/OVERSIZED templates in BLACK/WHITE (their own
// PRODUCTS/COLORS enums reject anything else), so a Bespoke mockup needs
// *some* concrete template to render onto. Reuses the exact same fallback
// getBespokeShirtImage above already uses for the on-screen canvas preview
// (anything not literally "OVERSIZED"/"BLACK" renders as FITTED/WHITE), so
// the generated mockup always matches what the user has already been
// looking at on the canvas -- never a silent, different guess.
function resolveMockupProduct(product: ProductType | null): "FITTED" | "OVERSIZED" {
  return product === "OVERSIZED" ? "OVERSIZED" : "FITTED";
}

function resolveMockupColor(color: GarmentColor | null): "BLACK" | "WHITE" {
  return color === "BLACK" ? "BLACK" : "WHITE";
}

export default function BuilderClient({
  buildId,
  draftId,
  draft,
  placementsCount,
  initialUserAssets = [],
  initialMockupUrl = null,
  initialMockupFingerprint = null,
  initialAiMockupUrl = null,
  initialAiMockupFingerprint = null,
  initialCustomQuoteUsdCents = null,
  initialCustomQuoteNote = null,
  initialSavedArtworkUrl = null,
  initialArtworkPlacement = null,
  initialInWishlist = false,
  initialLayers = [],
  initialBackMockupUrl = null,
  initialBackMockupFingerprint = null,
  initialBackAiMockupUrl = null,
  initialBackAiMockupFingerprint = null,
}: BuilderClientProps) {
  const router = useRouter();
  const { status } = useSession();
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [state, setState] = useState<DraftDTO>({
    ...draft,
    // The active layer's artwork (see otherLayers below); falls back to the
    // legacy single artwork for drafts saved before layers existed.
    primaryAssetId:
      initialLayers.find(
        (layer) =>
          layer.placement ===
          (typeof initialArtworkPlacement?.placement === "string" ? initialArtworkPlacement.placement : null),
      )?.assetId ??
      initialLayers[0]?.assetId ??
      draft.primaryAssetId,
    product: draft.product ?? ("FITTED" as ProductType),
    color: draft.color ?? ("WHITE" as GarmentColor),
    fabric: draft.fabric ?? ("ESSENTIALS_170" as FabricType),
    quantity: draft.quantity ?? 1,
  });

  // Multi-artwork: up to MAX_ARTWORK_LAYERS artworks, one per placement.
  // The one being edited (the "active" layer) lives in the same single-
  // artwork state the editor always used -- activePlacement, artworkUrl,
  // artworkTransform, state.primaryAssetId -- so dragging/zooming/uploading
  // are unchanged; every other artwork waits in otherLayers. Switching
  // placement swaps the active layer in and out (switchPlacement).
  const savedPlacementKey =
    typeof initialArtworkPlacement?.placement === "string" && initialArtworkPlacement.placement
      ? (initialArtworkPlacement.placement as PlacementKey)
      : null;
  const initialActiveLayer =
    initialLayers.find((layer) => layer.placement === savedPlacementKey) ?? initialLayers[0] ?? null;
  const initialActivePlacement: PlacementKey =
    initialActiveLayer?.placement ?? savedPlacementKey ?? "CENTER_FRONT";
  const [otherLayers, setOtherLayers] = useState<EditorLayer[]>(() =>
    initialLayers.filter((layer) => layer !== initialActiveLayer),
  );
  const [activePlacement, setActivePlacement] = useState<PlacementKey>(initialActivePlacement);
  const [userAssets, setUserAssets] = useState<UserAssetDTO[]>(initialUserAssets);
  const [removingAssetId, setRemovingAssetId] = useState<string | null>(null);
  const [, setUploadName] = useState("");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(initialActiveLayer?.url ?? null);
  const [artworkTransform, setArtworkTransform] = useState<ArtworkTransform>(() => {
    const p = initialActiveLayer ?? initialArtworkPlacement;
    if (!p) return DEFAULT_ARTWORK_TRANSFORM;
    const bounds = getEffectiveScaleBounds(state.product ?? "FITTED", state.color ?? "WHITE", activePlacement);
    return {
      x: typeof p.x === "number" && Number.isFinite(p.x) ? p.x : 0,
      y: typeof p.y === "number" && Number.isFinite(p.y) ? p.y : 0,
      scale: clampArtworkScale(typeof p.scale === "number" ? p.scale : 1, bounds),
      rotation: clampArtworkRotation(p.rotation),
    };
  });
  // Canonical saved-artwork URL (Artwork model). Set on "Save T-Shirt" and
  // seeded from the persisted value on load so a refresh/re-open shows the
  // exact saved image without regenerating anything.
  const [savePending, setSavePending] = useState(false);
  const [inWishlist, setInWishlist] = useState(initialInWishlist);
  const [wishlistPending, setWishlistPending] = useState(false);
  const [wishlistError, setWishlistError] = useState<string | null>(null);
  // printMockupUrl/printMockupFingerprint hold the deterministic compositor
  // result (POST /api/mockups/print, persisted as Mockup(kind="PRINT")).
  // aiMockupUrl/aiMockupFingerprint hold the Gemini result (POST
  // /api/mockups/nanobanana, persisted as Mockup(kind="AI")). These two used
  // to collide: the state below named "generatedMockupUrl" was seeded from
  // the print-sourced prop but written to by the AI generator -- kept
  // genuinely separate now.
  const [printMockupUrl, setPrintMockupUrl] = useState<string | null>(
    initialMockupUrl,
  );
  const [printMockupFingerprint, setPrintMockupFingerprint] = useState<string | null>(
    initialMockupFingerprint,
  );
  // Falls back to the canonical saved-artwork URL so the preview still
  // shows the exact saved image if the Build-scoped aiMockup row is ever
  // pruned. The AI generator overwrites this with a fresh Gemini result.
  const [aiMockupUrl, setAiMockupUrl] = useState<string | null>(
    initialAiMockupUrl ?? initialSavedArtworkUrl ?? null,
  );
  const [aiMockupFingerprint, setAiMockupFingerprint] = useState<string | null>(
    initialAiMockupFingerprint ?? null,
  );
  // Back-of-garment mockups (the states above are the front).
  const [backPrintMockupUrl, setBackPrintMockupUrl] = useState<string | null>(initialBackMockupUrl);
  const [backPrintMockupFingerprint, setBackPrintMockupFingerprint] = useState<string | null>(
    initialBackMockupFingerprint,
  );
  const [backAiMockupUrl, setBackAiMockupUrl] = useState<string | null>(initialBackAiMockupUrl);
  const [backAiMockupFingerprint, setBackAiMockupFingerprint] = useState<string | null>(
    initialBackAiMockupFingerprint,
  );
  const [mockupPending, setMockupPending] = useState(false);
  const [mockupError, setMockupError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [showCustomPopup, setShowCustomPopup] = useState(false);
  const [showBespokeModal, setShowBespokeModal] = useState(false);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [attachingAssetId, setAttachingAssetId] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<SizeOption>("M");
  const [fabricOpen, setFabricOpen] = useState(false);
  const [price, setPrice] = useState<PriceResult | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  // Set only when /api/pricing/quote itself failed (non-2xx, or the fetch
  // rejected outright) -- distinct from price.message, which carries a
  // legitimate "no pricing configured"/"bulk quote" reason from a normal
  // 200 response. Keeping them separate means a transient failure never
  // gets mistaken for (or masks) a real pricing-unavailable state.
  const [priceError, setPriceError] = useState<string | null>(null);
  // Bumped by the "Retry pricing" affordance to re-run the pricing effect
  // on demand, independent of any product/fabric/quantity/placement change.
  const [pricingRetryToken, setPricingRetryToken] = useState(0);
  const [checkoutAfterAuth, setCheckoutAfterAuth] = useState(false);
  // Admin-set Bespoke/Custom quote -- see BuilderClientProps above. Cleared
  // optimistically the instant save() sends a materially different draft
  // (mirroring the server-side invalidation in actionUpdateDraft) so a
  // stale "quoted" price/enabled Checkout never lingers client-side after
  // a local edit the server has already invalidated.
  const [customQuoteUsdCents, setCustomQuoteUsdCents] = useState<number | null>(
    initialCustomQuoteUsdCents,
  );
  const [customQuoteNote, setCustomQuoteNote] = useState<string | null>(initialCustomQuoteNote);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Ids for optimistic "Your uploads" tiles until the server returns the real one.
  const tempUploadCounterRef = useRef(0);
  const fabricMenuRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: ArtworkTransform;
  } | null>(null);

  // previewRef (ref callback) attaches to .studio-bespoke-canvas, which is
  // portal-rendered by BespokeModal only once the user opens it -- well
  // after this component's first render. A ref callback fires exactly when
  // that attach/detach happens, so bespokeCanvasWidth (used below to
  // convert artworkTransform's fraction-based x/y into real px for the
  // CSS translate()) is never stuck at a stale/zero measurement.
  const { setRef: previewRef, nodeRef: previewNodeRef, width: bespokeCanvasWidth } =
    useMeasuredRefCallback<HTMLDivElement>();

  const qty = useMemo(() => clampQty(Number(state.quantity ?? 1)), [state.quantity]);
  // The active layer (the artwork being edited) as a layer, when there is one.
  const activeLayer = useMemo<EditorLayer | null>(() => {
    if (!artworkUrl || !state.primaryAssetId) return null;
    return {
      placement: activePlacement,
      assetId: state.primaryAssetId,
      url: artworkUrl,
      x: artworkTransform.x,
      y: artworkTransform.y,
      scale: artworkTransform.scale,
      rotation: artworkTransform.rotation ?? 0,
    };
  }, [activePlacement, artworkTransform, artworkUrl, state.primaryAssetId]);

  // Every artwork in the design, the active one first (it is what the
  // legacy primaryAssetId/artworkPlacement mirror on save).
  const allLayers = useMemo<EditorLayer[]>(
    () => (activeLayer ? [activeLayer, ...otherLayers.filter((l) => l.placement !== activeLayer.placement)] : otherLayers),
    [activeLayer, otherLayers],
  );

  // Placements carrying artwork -- these are what get priced and what the
  // placement cards show as selected.
  const selectedPlacements = useMemo<PlacementKey[]>(() => allLayers.map((layer) => layer.placement), [allLayers]);
  const pricingPlacements = useMemo<PlacementKey[]>(
    () => (selectedPlacements.length ? selectedPlacements : [activePlacement]),
    [activePlacement, selectedPlacements],
  );

  const allFabricOptions = [
    {
      key: "ESSENTIALS_170" as FabricType,
      name: "ESSENTIALS",
      gsm: "170 GSM Cotton",
      desc: "Lightweight everyday cotton with a clean minimal hand feel.",
    },
    {
      key: "SIGNATURE_200" as FabricType,
      name: "SIGNATURE",
      gsm: "200 GSM Cotton",
      desc: "Our balanced premium weight. Smooth, buttery, structured, and designed to hold its shape.",
    },
    {
      key: "HEAVYWEIGHT_300" as FabricType,
      name: "HEAVYWEIGHT",
      gsm: "300 GSM Cotton",
      desc: "Dense luxury cotton with elevated structure and a substantial drape.",
    },
  ];

  // FITTED + HEAVYWEIGHT_300 has no configured price anywhere (PricingRule
  // is empty and FALLBACK_PRICES has no FITTED.HEAVYWEIGHT_300 entry -- see
  // src/pricing/engine.ts), so computePrice() rejects it and checkout
  // throws. This hides the option for FITTED rather than letting a
  // customer pick a combination that can never reach checkout; it changes
  // no pricing or rendering behavior.
  const fabricOptions = allFabricOptions.filter(
    (fabric) => !(state.product === "FITTED" && fabric.key === "HEAVYWEIGHT_300"),
  );

  // The five placements in the Figma popup ("Back" is the full back).
  // Center Back is no longer offered, but stays visible on a design that
  // already uses it so that artwork can still be seen, edited or removed.
  const placementCards: Array<{ key: PlacementKey; label: string; image: string }> = [
    { key: "FULL_FRONT", label: "Full Front", image: "/images/Frame 1.png" },
    { key: "CENTER_FRONT", label: "Center Front", image: "/images/Frame 2.png" },
    { key: "LEFT_CHEST", label: "Left Chest", image: "/images/Frame 3.png" },
    { key: "RIGHT_CHEST", label: "Right Chest", image: "/images/Frame 4.png" },
    { key: "FULL_BACK", label: "Back", image: "/images/Frame 5.png" },
    ...(activePlacement === "CENTER_BACK" ||
    initialLayers.some((layer) => layer.placement === "CENTER_BACK") ||
    otherLayers.some((layer) => layer.placement === "CENTER_BACK")
      ? [{ key: "CENTER_BACK" as PlacementKey, label: "Center Back", image: "/images/Frame 6.png" }]
      : []),
  ];

  const currentFabric =
    fabricOptions.find((fabric) => fabric.key === state.fabric) ?? fabricOptions[0];

  const currentColorLabel = state.color === "BLACK" ? "Black" : "White";

  const activeArtworkAsset = useMemo(() => {
    return (
      userAssets.find(
        (asset) => asset.id === state.primaryAssetId || asset.url === artworkUrl,
      ) ?? null
    );
  }, [artworkUrl, state.primaryAssetId, userAssets]);

  // The AI mockup is now 100% derived from the Print Mockup (POST
  // /api/mockups/nanobanana resolves the Print Mockup server-side from
  // draftId and stamps the AI mockup with the Print Mockup's own
  // fingerprint verbatim -- see app/api/mockups/nanobanana/route.ts). So
  // there is exactly one live fingerprint, using the same rotation (the live
  // artworkTransform.rotation, which round-trips through the persisted
  // placement -- see P3-21c) and dpi (BASELINE_RENDER_DPI,
  // since generatePrintMockup never overrides it) the server will actually
  // use, so a fresh print mockup doesn't immediately appear stale against
  // its own just-persisted fingerprint. Both isPrintMockupStale and
  // isAiMockupStale compare against it.
  // One fingerprint per garment side, over every artwork on that side
  // (src/studio/artwork-layers.ts) -- identical to the old single-artwork
  // fingerprint for a one-artwork side, so existing mockups stay fresh.
  // Resolved product/color (never "CUSTOM") and the baseline dpi: exactly
  // what the print/AI routes compute, so a freshly generated mockup is never
  // immediately stale against its own fingerprint.
  const mockupProduct = resolveMockupProduct(state.product);
  const mockupColor = resolveMockupColor(state.color);
  const liveFingerprints = useMemo(
    () => ({
      front: sideFingerprint({ layers: layersForSide(allLayers, "front"), product: mockupProduct, color: mockupColor, dpi: BASELINE_RENDER_DPI }),
      back: sideFingerprint({ layers: layersForSide(allLayers, "back"), product: mockupProduct, color: mockupColor, dpi: BASELINE_RENDER_DPI }),
    }),
    [allLayers, mockupColor, mockupProduct],
  );

  // Generated mockups per side (front = the original state names).
  const sideMockups = {
    front: { printUrl: printMockupUrl, printFp: printMockupFingerprint, aiUrl: aiMockupUrl, aiFp: aiMockupFingerprint },
    back: { printUrl: backPrintMockupUrl, printFp: backPrintMockupFingerprint, aiUrl: backAiMockupUrl, aiFp: backAiMockupFingerprint },
  } as const;

  function isSideAiFresh(side: "front" | "back") {
    const live = liveFingerprints[side];
    const mockup = sideMockups[side];
    return Boolean(live && mockup.aiUrl && mockup.aiFp === live);
  }

  // Sides whose AI mockup is missing or out of date for the current design.
  const sidesNeedingGeneration = sidesWithLayers(allLayers).filter((side) => !isSideAiFresh(side));

  // Any design change makes the affected side's mockups stale on their own
  // (their fingerprint no longer matches liveFingerprints), and the other
  // side's mockups stay valid -- so nothing is thrown away here any more;
  // only a leftover error message is cleared.
  function discardMockups() {
    setMockupError(null);
  }

  // Fit the whole builder into the window with no page scroll. From
  // 1024px up, app/globals.css ("Figma pass", section 2) draws the design's
  // 1392x816 content area at its real size; this zooms it down as one
  // piece to fit the window (up to MAX_UPSCALE on large screens), and gives the
  // shell exactly the remaining viewport height. Below 1024px the layout
  // stacks and scrolls normally, so the variables are cleared.
  const shellRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const LAYOUT_WIDTH = 1392;
    const LAYOUT_HEIGHT = 816;
    // Large screens (e.g. 1920x1080) scale the composition up too rather
    // than leaving it at 1440 size with a band of empty space below.
    const MAX_UPSCALE = 1.25;
    const fit = () => {
      if (window.innerWidth < 1024) {
        shell.style.removeProperty("--studio-avail");
        shell.style.removeProperty("--studio-fit");
        return;
      }
      const top = shell.getBoundingClientRect().top + window.scrollY;
      const available = Math.max(0, window.innerHeight - top);
      const frame = shell.querySelector<HTMLElement>(".studio-builder-frame");
      const width = frame?.clientWidth ?? shell.clientWidth;
      shell.style.setProperty("--studio-avail", `${available}px`);
      shell.style.setProperty(
        "--studio-fit",
        String(Math.min(MAX_UPSCALE, available / LAYOUT_HEIGHT, width / LAYOUT_WIDTH)),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Placement/product each carry their own scale ceiling
  // (getEffectiveScaleBounds -- the same function the server's
  // resolvePlacement uses). Switching to a placement with a tighter ceiling
  // (e.g. from FULL_FRONT to LEFT_CHEST) must not leave an out-of-range
  // scale sitting in state that the server would silently reduce on
  // generation with no visual feedback -- re-clamp proactively instead.
  // Uses the functional setState form (no artworkTransform in deps) so this
  // can't loop, and only writes when the clamp actually changes something.
  useEffect(() => {
    const bounds = getEffectiveScaleBounds(state.product ?? "FITTED", state.color ?? "WHITE", activePlacement);
    setArtworkTransform((current) => {
      const clamped = clampArtworkScale(current.scale, bounds);
      return clamped === current.scale ? current : { ...current, scale: clamped };
    });
  }, [activePlacement, state.product, state.color]);

  useEffect(() => {
    if (artworkUrl || !state.primaryAssetId) return;

    const asset = userAssets.find((item) => item.id === state.primaryAssetId);
    if (asset?.url) {
      setArtworkUrl(asset.url);
      setUploadName(asset.fileName);
    }
  }, [artworkUrl, state.primaryAssetId, userAssets]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!fabricOpen) return;
      if (!fabricMenuRef.current?.contains(event.target as Node)) {
        setFabricOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [fabricOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadPrice() {
      setLoadingPrice(true);
      setPriceError(null);

      // Bounded: attempt 1 plus (at most) one retry for a transient
      // failure. A genuine non-transient failure (4xx, or retries
      // exhausted) breaks out and surfaces the real message instead of
      // looping.
      for (let attempt = 1; ; attempt++) {
        let res: Response;
        try {
          res = await fetch("/api/pricing/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product: state.product,
              fabric: state.fabric,
              quantity: qty,
              placements: pricingPlacements,
            }),
          });
        } catch {
          // fetch() itself rejected (offline, DNS failure, connection
          // reset) -- as transient as a 429/5xx response, so it gets the
          // same bounded retry rather than immediately disabling checkout.
          if (attempt < PRICE_QUOTE_MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, PRICE_QUOTE_RETRY_DELAY_MS));
            if (cancelled) return;
            continue;
          }
          if (!cancelled) {
            setPrice(null);
            setPriceError("Could not reach the pricing service. Check your connection and try again.");
          }
          break;
        }

        if (res.ok) {
          const data = (await res.json().catch(() => null)) as PriceResult | null;
          if (!cancelled) {
            if (data) {
              setPrice(data);
            } else {
              setPrice(null);
              setPriceError("Pricing is temporarily unavailable.");
            }
          }
          break;
        }

        // Never store the API's error body ({ ok: false, error }) as a
        // PriceResult -- it doesn't have a `mode`, so price?.mode ===
        // "standard" would correctly stay false, but priceText's fallback
        // would silently show a generic message instead of the real,
        // often-actionable one below.
        const errorData = await res.json().catch(() => null);
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < PRICE_QUOTE_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, PRICE_QUOTE_RETRY_DELAY_MS));
          if (cancelled) return;
          continue;
        }

        if (!cancelled) {
          setPrice(null);
          setPriceError(
            typeof errorData?.error === "string" ? errorData.error : "Pricing is temporarily unavailable.",
          );
        }
        break;
      }

      if (!cancelled) setLoadingPrice(false);
    }

    if (state.product && state.fabric) {
      void loadPrice();
    } else {
      setPrice(null);
      setPriceError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [pricingPlacements, qty, state.fabric, state.product, pricingRetryToken]);

  useEffect(() => {
    if (status !== "authenticated" || !showAuthModal) return;

    setShowAuthModal(false);
    setAuthPassword("");
    if (checkoutAfterAuth) {
      setCheckoutAfterAuth(false);
      // An un-quoted Bespoke ("CUSTOM") build opens the no-payment request
      // intake; a quoted Bespoke build and every standard product go to the
      // Paymob checkout, unchanged.
      const isBespokeRequest = state.product === "CUSTOM" && customQuoteUsdCents == null;
      router.push(
        isBespokeRequest
          ? `/bespoke/new?buildId=${buildId}`
          // selectedSize must travel with the redirect: this is the ONLY
          // place the customer's chosen S/M/L/XL is captured (Builder never
          // persists it to BuildDraft -- see the schema comment on
          // WishlistItem.size / BespokeRequest.size, which snapshot it at
          // the point of a real action instead). Previously this was
          // dropped entirely, so every standard order silently defaulted to
          // size "M" in src/lib/orders/checkout.ts regardless of what the
          // customer picked.
          : `/checkout?buildId=${buildId}&size=${encodeURIComponent(selectedSize)}`,
      );
    } else {
      setShowBespokeModal(true);
    }
  }, [buildId, checkoutAfterAuth, router, showAuthModal, status, state.product, customQuoteUsdCents, selectedSize]);

  function save(next: DraftDTO) {
    // Mirrors actionUpdateDraft's server-side quote invalidation
    // (src/actions/build-actions.ts) so the UI never shows a stale
    // "quoted" price/enabled Checkout for even one render after a local
    // edit the server is about to invalidate anyway.
    const changedFromQuotedState =
      state.product !== next.product ||
      state.color !== next.color ||
      state.fabric !== next.fabric ||
      state.quantity !== next.quantity ||
      (state.customNotes ?? null) !== (next.customNotes ?? null) ||
      (state.primaryAssetId ?? null) !== (next.primaryAssetId ?? null);

    if (changedFromQuotedState && customQuoteUsdCents != null) {
      setCustomQuoteUsdCents(null);
      setCustomQuoteNote(null);
    }

    setState(next);

    const fd = new FormData();
    fd.set("product", next.product ?? "");
    fd.set("color", next.color ?? "");
    fd.set("fabric", next.fabric ?? "");
    fd.set("quantity", String(next.quantity ?? 1));
    fd.set("customNotes", next.customNotes ?? "");
    fd.set("primaryAssetId", next.primaryAssetId ?? "");

    startTransition(() => actionUpdateDraft(buildId, fd));
  }


  // Persist the design whenever its artworks change (debounced -- a drag
  // changes the active layer's x/y many times a second). The priced
  // placements in customNotes are kept in step on the client too: save()
  // (product/quantity/...) re-sends customNotes from local state, and must
  // never put back a stale placement list.
  const persistedLayersKeyRef = useRef<string | null>(null);
  const layersPayload = useMemo(
    () => allLayers.map(({ placement, assetId, x, y, scale, rotation }) => ({ placement, assetId, x, y, scale, rotation })),
    [allLayers],
  );
  const layersKey = JSON.stringify(layersPayload);
  // True while actionSwitchProduct swaps designs: the layers on screen are
  // being replaced and must not be saved (to either product) meanwhile.
  const switchingProductRef = useRef(false);
  useEffect(() => {
    if (persistedLayersKeyRef.current === null) {
      persistedLayersKeyRef.current = layersKey; // what the page loaded with
      return;
    }
    if (switchingProductRef.current) return;
    if (persistedLayersKeyRef.current === layersKey) return;

    const placements = layersPayload.map((layer) => layer.placement);
    if (placements.length) {
      setState((current) => {
        const nextNotes = upsertPlacementsInNotes(current.customNotes, placements);
        if (nextNotes === current.customNotes) return current;
        // Mirrors the server: a placement change voids an admin quote.
        setCustomQuoteUsdCents(null);
        setCustomQuoteNote(null);
        return { ...current, customNotes: nextNotes };
      });
    }

    const timer = window.setTimeout(() => {
      persistedLayersKeyRef.current = layersKey;
      void actionSaveArtworkLayers(buildId, layersPayload, state.product).catch(() => {
        // Not null (that means "initial load, skip"): any value that
        // differs from the next key makes the next change retry the save.
        persistedLayersKeyRef.current = "__save-failed__";
      });
    }, 700);
    return () => window.clearTimeout(timer);
    // state.product is read only to tag the save (see actionSaveArtworkLayers).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildId, layersKey, layersPayload]);

  async function handleUpload(file: File) {
    if (!canAddArtworkToActivePlacement()) return;
    if (!ALLOWED_ARTWORK_MIME_TYPES.has(file.type)) {
      setMockupError("Artwork must be PNG, JPG, WEBP, or SVG.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_ARTWORK_BYTES) {
      setMockupError("Artwork file must be smaller than 10MB.");
      return;
    }

    const previousArtworkUrl = artworkUrl;
    const localUrl = URL.createObjectURL(file);
    setUploadName(file.name);
    setArtworkUrl(localUrl);
    setArtworkTransform(DEFAULT_ARTWORK_TRANSFORM);
    discardMockups();

    tempUploadCounterRef.current += 1;
    const tempId = `temp-upload-${tempUploadCounterRef.current}`;
    const newLocalAsset: UserAssetDTO = {
      id: tempId,
      buildId,
      url: localUrl,
      fileName: file.name,
    };
    setUserAssets((prev) => [newLocalAsset, ...prev]);

    const fd = new FormData();
    fd.set("file", file);
    fd.set("fileName", file.name);
    fd.set("mimeType", file.type || "application/octet-stream");
    fd.set("sizeBytes", String(file.size || 0));

    startTransition(() => {
      actionCreateAssetForBuilder(buildId, fd).then((res: CreatedAssetDTO) => {
        if (res && res.id) {
          const persistedUrl = res.url;
          // Re-uploading an image that's already in "Your uploads" (same
          // content hash) replaces its tile rather than adding a second one.
          const persisted: UserAssetDTO = {
            id: res.id,
            buildId: res.buildId ?? buildId,
            url: persistedUrl || localUrl,
            fileName: res.fileName ?? file.name,
            hash: res.artworkSha256 ?? null,
          };
          setUserAssets((prev) => withAssetFirst(prev, persisted, tempId));
          // Promote the preview from the temporary blob: URL to the durable
          // server URL now that the upload is confirmed persisted -- only if
          // nothing else (replace/remove) has changed the preview in the
          // meantime, and only after the swap so the blob is never revoked
          // while it's still the visible src.
          if (persistedUrl) {
            setArtworkUrl((current) => (current === localUrl ? persistedUrl : current));
            URL.revokeObjectURL(localUrl);
          }
          save({
            ...state,
            primaryAssetId: res.id,
          });
        }
      }).catch((error) => {
        setUserAssets((prev) => prev.filter((asset) => asset.id !== tempId));
        // Revert to whatever was showing before this attempt (not null) so a
        // failed replacement doesn't wipe out an already-selected artwork.
        setArtworkUrl((current) => (current === localUrl ? previousArtworkUrl : current));
        setUploadName("");
        setMockupError(error instanceof Error ? error.message : "Could not upload artwork.");
        URL.revokeObjectURL(localUrl);
      });
    });
  }

  async function selectAsset(asset: UserAssetDTO) {
    if (!canAddArtworkToActivePlacement()) return;
    setArtworkUrl(asset.url);
    setUploadName(asset.fileName);
    setArtworkTransform(DEFAULT_ARTWORK_TRANSFORM);
    discardMockups();

    if (!asset.buildId || asset.buildId === buildId) {
      setUserAssets((prev) => withAssetFirst(prev, asset));
      save({ ...state, primaryAssetId: asset.id });
      return;
    }

    setAttachingAssetId(asset.id);

    try {
      const attached = await actionAttachExistingAsset(buildId, asset.id);
      if (!attached?.id || !attached.url) return;

      const nextAsset: UserAssetDTO = {
        id: attached.id,
        buildId: attached.buildId,
        url: attached.url,
        fileName: attached.fileName,
        hash: attached.artworkSha256 ?? asset.hash ?? null,
      };

      // The attach copied the image into this project: show the copy, first,
      // in place of the tile that was clicked (never both).
      setUserAssets((prev) => withAssetFirst(prev, nextAsset, asset.id));
      setArtworkUrl(nextAsset.url);
      setUploadName(nextAsset.fileName);
      save({ ...state, primaryAssetId: nextAsset.id });
    } catch {
      alert("Could not load this artwork.");
    } finally {
      setAttachingAssetId(null);
    }
  }

  // The × on a "Your uploads" tile. Optimistic: the tile disappears at
  // once and comes back if the server refuses. Removing the artwork that's
  // currently on the shirt also takes it off the shirt (the server clears
  // it from the draft too -- see actionRemoveAsset).
  async function removeUserAsset(asset: UserAssetDTO) {
    // Confirmation happens in the popup itself (BespokeModal's in-tile
    // "Remove this upload?" prompt), so by here the customer has confirmed.
    if (removingAssetId) return;

    const isOnShirt = state.primaryAssetId === asset.id || artworkUrl === asset.url;
    const previous = userAssets;
    setRemovingAssetId(asset.id);
    setUserAssets((prev) =>
      prev.filter((item) => item.id !== asset.id && !(asset.hash && item.hash === asset.hash)),
    );
    if (isOnShirt) removeSelectedArtwork();

    try {
      const result = await actionRemoveAsset(buildId, asset.id);
      if (!result.ok) throw new Error(result.error);
    } catch {
      setUserAssets(previous);
      alert("Could not remove this upload. Please try again.");
    } finally {
      setRemovingAssetId(null);
    }
  }

  function removeSelectedArtwork() {
    setArtworkUrl(null);
    setUploadName("");
    setArtworkTransform(DEFAULT_ARTWORK_TRANSFORM);
    discardMockups();
    save({ ...state, primaryAssetId: null });
  }

  function updateArtworkTransform(next: ArtworkTransform) {
    const product = state.product ?? "FITTED";
    const color = state.color ?? "WHITE";
    const bounds = getEffectiveScaleBounds(product, color, activePlacement);
    const scale = clampArtworkScale(next.scale, bounds);
    const dragBounds = getDragBounds(product, color, activePlacement, scale);
    const { x, y } = clampArtworkPosition(next.x, next.y, dragBounds);
    setArtworkTransform({
      // x/y are fractions of the preview container's own width (see
      // src/studio/render/transform.ts), not raw px -- round to decimal
      // precision like scale, not to the nearest integer. Clamped to
      // getDragBounds first so the artwork can never be dragged off the
      // visible shirt canvas.
      x: Math.round(x * 10000) / 10000,
      y: Math.round(y * 10000) / 10000,
      scale,
      // P3-21c: preserved rather than dropped -- rebuilding the transform
      // without it made the first drag/zoom silently reset rotation to 0.
      rotation: clampArtworkRotation(next.rotation),
    });
    discardMockups();
  }

  function changeArtworkScale(scale: number) {
    updateArtworkTransform({
      ...artworkTransform,
      scale,
    });
  }

  function resetArtworkTransform() {
    updateArtworkTransform(DEFAULT_ARTWORK_TRANSFORM);
  }

  function handleArtworkPointerDown(event: ReactPointerEvent<HTMLImageElement>) {
    // The draggable overlay <img> only exists in the DOM when it's meant
    // to be interactive (BespokeModal renders it only when
    // !generatedMockupUrl || isMockupStale) -- gating on printMockupUrl
    // here too was redundant, and actively wrong now that "Generate AI
    // Mockup" always (re)generates a Print Mockup first: printMockupUrl
    // would stay permanently truthy after the very first click, silently
    // blocking every subsequent drag for the rest of the session.
    if (!artworkUrl) return;
    event.preventDefault();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: artworkTransform,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleArtworkPointerMove(event: ReactPointerEvent<HTMLImageElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    // previewRef is the drag surface, sized to the active side's real
    // template aspect ratio (BespokeModal's previewAspectRatio) -- square
    // for front, 2:3 portrait for back. BOTH deltas are divided by its
    // width regardless, since width is the unit artworkOffsetPx and
    // resolvePlacement read them back in; dividing y by the height here
    // would desync the drag from the render on back placements. Measured
    // live (not cached at pointerdown) since it's a cheap read and keeps
    // this correct even if the canvas were to resize mid-drag.
    const containerWidth = previewNodeRef.current?.getBoundingClientRect().width;
    if (!containerWidth) return;

    // The pixel delta is measured against the FLAT TEE canvas, so it is an
    // editor-space offset -- convert it back to template space before
    // adding it to the (template-space) origin, or the artwork would track
    // the cursor at the wrong rate and everything downstream (clamping,
    // persistence, the render) would receive the wrong numbers. This is
    // the exact inverse of the toEditorOffset applied in
    // bespokeArtworkTransform.
    const editorDelta = {
      x: (event.clientX - dragState.startX) / containerWidth,
      y: (event.clientY - dragState.startY) / containerWidth,
    };
    const templateDelta = toTemplateOffset(editorDelta, state.product, state.color, activePlacement);

    updateArtworkTransform({
      ...dragState.origin,
      x: dragState.origin.x + templateDelta.x,
      y: dragState.origin.y + templateDelta.y,
    });
  }

  function handleArtworkPointerUp(event: ReactPointerEvent<HTMLImageElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
  }



  function openCheckout() {
    if (!state.product || !state.color || !state.fabric) {
      alert("Please complete selection");
      return;
    }

    // An un-quoted BESPOKE ("CUSTOM") build: no price, no payment. The CTA
    // submits a no-payment request (Builder -> BESPOKE -> Checkout ->
    // Create Bespoke Request); the tailored quote comes later. Once the
    // team has set a quote (customQuoteUsdCents), the same build instead
    // uses the normal Paymob checkout -- the "pay later" path, unchanged.
    const isBespokeRequest = state.product === "CUSTOM" && customQuoteUsdCents == null;
    const hasReadyPrice = isBespokeRequest
      ? true
      : state.product === "CUSTOM"
        ? customQuoteUsdCents != null
        : price?.mode === "standard";
    if (!hasReadyPrice) {
      alert("Pricing not ready");
      return;
    }

    if (status !== "authenticated") {
      // Remembered so the post-login effect (and handleAuthSubmit below)
      // know to continue instead of opening the Bespoke editor modal, which
      // is what this same auth modal is used for elsewhere.
      setCheckoutAfterAuth(true);
      setShowAuthModal(true);
      return;
    }

    router.push(
      isBespokeRequest
        ? `/bespoke/new?buildId=${buildId}`
        : `/checkout?buildId=${buildId}&size=${encodeURIComponent(selectedSize)}`,
    );
  }

  function openCustomRequestPopup() {
    setShowCustomPopup(true);
  }

  function requestAuth(mode: AuthMode = "login") {
    setAuthMode(mode);
    setAuthError(null);
    setShowAuthModal(true);
  }

  function openBespokeBuilder() {
    if (status === "authenticated") {
      setShowBespokeModal(true);
      return;
    }

    requestAuth("login");
  }

  function switchAuthMode(mode: AuthMode) {
    setAuthMode(mode);
    setAuthError(null);
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const email = authEmail.trim().toLowerCase();
    const password = authPassword;

    if (!email || !password) {
      setAuthError("Enter your email and password.");
      return;
    }

    setAuthPending(true);
    setAuthError(null);

    try {
      if (authMode === "signup") {
        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!registerResponse.ok) {
          const data = await registerResponse.json().catch(() => null);
          throw new Error(data?.error ?? "Registration failed.");
        }
      }

      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl: window.location.pathname,
      });

      if (!result) throw new Error("Unknown error.");
      if (result.error) throw new Error("Invalid email or password.");

      setShowAuthModal(false);
      setAuthPassword("");
      if (checkoutAfterAuth) {
        setCheckoutAfterAuth(false);
        const isBespokeRequest = state.product === "CUSTOM" && customQuoteUsdCents == null;
        router.push(
          isBespokeRequest
            ? `/bespoke/new?buildId=${buildId}`
            : `/checkout?buildId=${buildId}&size=${encodeURIComponent(selectedSize)}`,
        );
      } else {
        setShowBespokeModal(true);
        router.refresh();
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setAuthPending(false);
    }
  }

  async function continueCustomRequest() {
    setShowCustomPopup(false);
    await switchProduct("CUSTOM" as ProductType);
    openBespokeBuilder();
  }

  // Single-select: picking a placement replaces the previous one, and
  // picking the current one again keeps it (never leaves none selected).
  // Make `key` the placement being edited: the current artwork (if any) is
  // parked in otherLayers and the artwork already on `key` (if any) is
  // loaded into the editor state. Nothing is lost either way.
  function switchPlacement(key: PlacementKey) {
    if (key === activePlacement) return;
    const target = otherLayers.find((layer) => layer.placement === key) ?? null;
    setOtherLayers((prev) => {
      const rest = prev.filter((layer) => layer.placement !== key);
      return activeLayer ? [...rest.filter((l) => l.placement !== activeLayer.placement), activeLayer] : rest;
    });
    setActivePlacement(key);
    if (target) {
      setArtworkUrl(target.url);
      setUploadName(target.fileName ?? "");
      setArtworkTransform({ x: target.x, y: target.y, scale: target.scale, rotation: target.rotation });
      setState((current) => ({ ...current, primaryAssetId: target.assetId }));
    } else {
      setArtworkUrl(null);
      setUploadName("");
      setArtworkTransform(DEFAULT_ARTWORK_TRANSFORM);
      setState((current) => ({ ...current, primaryAssetId: null }));
    }
    setMockupError(null);
  }

  // Removes the artwork on `placement` (the × on a Selected Artwork card).
  function removeLayer(placement: PlacementKey) {
    setMockupError(null);
    if (placement === activePlacement) {
      removeSelectedArtwork();
      return;
    }
    setOtherLayers((prev) => prev.filter((layer) => layer.placement !== placement));
  }

  // Putting artwork on an EMPTY placement adds a layer -- refused past
  // MAX_ARTWORK_LAYERS. Replacing the artwork on a placement that already
  // has one is always allowed.
  function canAddArtworkToActivePlacement() {
    if (activeLayer) return true;
    if (otherLayers.length < MAX_ARTWORK_LAYERS) return true;
    setMockupError(`You can add up to ${MAX_ARTWORK_LAYERS} artworks. Remove one to add another.`);
    return false;
  }

  // Drag & drop from "Your uploads" onto the shirt: the artwork goes to the
  // placement nearest the drop point, among the placements of the side
  // currently shown (front or back), replacing whatever was there.
  function placementAtDropPoint(clientX: number, clientY: number): PlacementKey | null {
    const canvas = previewNodeRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const side = getPlacementSide(activePlacement);
    let best: { key: PlacementKey; distance: number } | null = null;
    for (const card of placementCards) {
      if (getPlacementSide(card.key) !== side) continue;
      const box = getEditorPlacementBox(state.product, state.color, card.key);
      // Placement boxes are width-anchored (height follows the artwork), so
      // use a square-ish box: its height in canvas-height units.
      const heightFrac = box.heightPct ?? (box.widthPct * rect.width) / rect.height;
      const cx = box.xPct + box.widthPct / 2;
      const cy = box.yPct + heightFrac / 2;
      const inside = fx >= box.xPct && fx <= box.xPct + box.widthPct && fy >= box.yPct && fy <= box.yPct + heightFrac;
      // Prefer the smallest box that contains the point (a chest box over
      // the full-front box it sits inside), else the nearest centre.
      const distance = (inside ? -1 / box.widthPct : 0) + Math.hypot(fx - cx, (fy - cy) * (rect.height / rect.width));
      if (!best || distance < best.distance) best = { key: card.key, distance };
    }
    return best?.key ?? null;
  }

  function dropAssetOnShirt(assetId: string, clientX: number, clientY: number) {
    const asset = userAssets.find((item) => item.id === assetId);
    const target = placementAtDropPoint(clientX, clientY);
    if (!asset || !target) return;
    const occupied = allLayers.some((layer) => layer.placement === target);
    if (!occupied && allLayers.length >= MAX_ARTWORK_LAYERS) {
      setMockupError(`You can add up to ${MAX_ARTWORK_LAYERS} artworks. Remove one to add another.`);
      return;
    }
    if (target === activePlacement) {
      void selectAsset(asset);
      return;
    }
    // switchPlacement's state lands on the next render; the effect below
    // then puts the dropped asset on the (new) active placement.
    pendingDropAssetRef.current = asset;
    switchPlacement(target);
  }

  const pendingDropAssetRef = useRef<UserAssetDTO | null>(null);
  useEffect(() => {
    const pending = pendingDropAssetRef.current;
    if (!pending) return;
    pendingDropAssetRef.current = null;
    void selectAsset(pending);
    // Runs once per placement switch caused by a drop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlacement]);

  // Each product type keeps its own design: switching parks the current
  // product's artworks + mockups on the server and loads the target
  // product's own (empty the first time) -- see actionSwitchProduct. So a
  // design and its generated mockups only ever appear on their own model.
  const [switchingProduct, setSwitchingProduct] = useState(false);
  async function switchProduct(next: ProductType, fabric?: FabricType | null) {
    if (switchingProduct) return;
    if (next === state.product) {
      if (fabric && fabric !== state.fabric) save({ ...state, fabric });
      return;
    }
    const currentLayers = layersPayload;
    switchingProductRef.current = true;
    setSwitchingProduct(true);

    // Show the target product straight away, with an empty design, until
    // the server answers with its real one.
    setState((current) => ({ ...current, product: next, ...(fabric ? { fabric } : {}) }));
    setCustomQuoteUsdCents(null);
    setCustomQuoteNote(null);
    setOtherLayers([]);
    setArtworkUrl(null);
    setUploadName("");
    setArtworkTransform(DEFAULT_ARTWORK_TRANSFORM);
    setPrintMockupUrl(null);
    setAiMockupUrl(null);
    setBackPrintMockupUrl(null);
    setBackAiMockupUrl(null);
    setMockupError(null);

    try {
      const result = await actionSwitchProduct(buildId, { product: next, fabric, currentLayers });
      const [first, ...rest] = result.layers as EditorLayer[];
      setState((current) => ({
        ...current,
        product: result.product,
        fabric: result.fabric,
        customNotes: result.customNotes,
        primaryAssetId: first?.assetId ?? null,
      }));
      setOtherLayers(rest);
      if (first) {
        setActivePlacement(first.placement);
        setArtworkUrl(first.url);
        setUploadName(first.fileName ?? "");
        setArtworkTransform({ x: first.x, y: first.y, scale: first.scale, rotation: first.rotation });
      }
      setPrintMockupUrl(result.mockups.front.printUrl);
      setPrintMockupFingerprint(result.mockups.front.printFp);
      setAiMockupUrl(result.mockups.front.aiUrl);
      setAiMockupFingerprint(result.mockups.front.aiFp);
      setBackPrintMockupUrl(result.mockups.back.printUrl);
      setBackPrintMockupFingerprint(result.mockups.back.printFp);
      setBackAiMockupUrl(result.mockups.back.aiUrl);
      setBackAiMockupFingerprint(result.mockups.back.aiFp);
      // The loaded design is exactly what the server now holds -- don't
      // re-save it.
      persistedLayersKeyRef.current = JSON.stringify(
        (result.layers as EditorLayer[]).map(({ placement, assetId, x, y, scale, rotation }) => ({
          placement,
          assetId,
          x,
          y,
          scale,
          rotation,
        })),
      );
    } catch {
      alert("Could not switch the product. Please try again.");
      router.refresh();
    } finally {
      switchingProductRef.current = false;
      setSwitchingProduct(false);
    }
  }

  function selectFittedProduct() {
    // HEAVYWEIGHT_300 is hidden for FITTED above (no configured price) --
    // fall back rather than leave an unpriced combination in state.
    void switchProduct(
      "FITTED" as ProductType,
      state.fabric === "HEAVYWEIGHT_300" ? ("SIGNATURE_200" as FabricType) : null,
    );
  }

  function selectOversizedProduct() {
    void switchProduct("OVERSIZED" as ProductType);
  }

  function selectBlackColor() {
    save({
      ...state,
      color: "BLACK" as GarmentColor,
    });
  }

  function selectWhiteColor() {
    save({
      ...state,
      color: "WHITE" as GarmentColor,
    });
  }

  function toggleFabricMenu() {
    setFabricOpen((value) => !value);
  }

  function selectFabric(fabric: FabricType) {
    save({
      ...state,
      fabric,
    });
    setFabricOpen(false);
  }

  function decreaseQuantity() {
    save({ ...state, quantity: Math.max(1, qty - 1) });
  }

  function increaseQuantity() {
    save({ ...state, quantity: Math.min(9999, qty + 1) });
  }

  function handleQuantityChange(event: ChangeEvent<HTMLInputElement>) {
    save({
      ...state,
      quantity: clampQty(Number(event.target.value)),
    });
  }

  function closeAuthModal() {
    setShowAuthModal(false);
    setCheckoutAfterAuth(false);
  }

  function toggleAuthMode() {
    switchAuthMode(authMode === "login" ? "signup" : "login");
  }

  function handleArtworkScaleChange(event: ChangeEvent<HTMLInputElement>) {
    changeArtworkScale(Number(event.target.value));
  }

  function handlePlacementClick(key: PlacementKey) {
    switchPlacement(key);
  }

  // "Save T-Shirt" just persists/closes -- it must NOT force product to
  // CUSTOM. This modal (openBespokeBuilder, the "Build Your T-Shirt"
  // button) is also the FITTED/OVERSIZED artwork editor, not only the
  // Bespoke request flow, so overwriting product here silently downgraded
  // an already-chosen FITTED/OVERSIZED selection to CUSTOM on every save,
  // which then failed generatePrintMockup's product check on the next
  // "Generate AI Mockup" click even though the user never touched product.
  // continueCustomRequest() above is the only place that should set CUSTOM.
  // Save T-Shirt is the popup's single action: it generates the AI mockup
  // first whenever one is needed (none yet, or stale against the current
  // design -- the same condition that used to show a separate "Generate AI
  // Mockup" button), then persists placement + artwork and closes. A failed
  // generation keeps the popup open with the error, so nothing is lost.
  async function saveBespokeTShirt() {
    if (savePending || mockupPending) return;
    const layers = allLayers;

    // 1. AI mockup for every side whose design changed (front and back are
    //    generated separately). A failure keeps the popup open with the
    //    error so nothing is lost.
    if (sidesNeedingGeneration.length) {
      setMockupPending(true);
      setMockupError(null);
      try {
        for (const side of sidesNeedingGeneration) {
          const ok = await generateSideMockups(side, layers);
          if (!ok) return;
        }
      } finally {
        setMockupPending(false);
      }
    }

    // 2. Persist the whole design: every layer, plus the legacy mirrors and
    //    the priced placements (actionSaveArtworkLayers), and the saved
    //    artwork image for Wishlist/Bespoke/Admin (actionSaveArtwork, from
    //    the front AI mockup -- or the back one for back-only designs).
    setSavePending(true);
    try {
      await actionSaveArtworkLayers(
        buildId,
        layers.map(({ placement, assetId, x, y, scale, rotation }) => ({ placement, assetId, x, y, scale, rotation })),
      );
      // The saved-artwork image is the FRONT AI mockup (saveArtworkForBuild),
      // so it only exists for designs with front artwork; a back-only design
      // simply has none (Wishlist/Admin then use the mockups directly).
      const frontLayers = layersForSide(layers, "front");
      if (frontLayers.length) {
        const first = frontLayers[0];
        await actionSaveArtwork(buildId, {
          placement: first.placement,
          x: first.x,
          y: first.y,
          scale: first.scale,
          rotation: first.rotation,
        });
      }
    } catch (error) {
      setMockupError(error instanceof Error ? error.message : "Could not save your design.");
      return;
    } finally {
      setSavePending(false);
    }

    setShowBespokeModal(false);
  }

  async function handleAddToWishlist() {
    if (status !== "authenticated") {
      requestAuth("login");
      return;
    }
    setWishlistPending(true);
    setWishlistError(null);
    try {
      const result = await actionAddToWishlist(buildId);
      if (result.ok) {
        setInWishlist(true);
      } else {
        setWishlistError(result.error);
      }
    } catch {
      setWishlistError("Could not update your wishlist. Please try again.");
    } finally {
      setWishlistPending(false);
    }
  }

  const priceText = loadingPrice
    ? "Calculating..."
    : state.product === "CUSTOM"
      ? customQuoteUsdCents != null
        ? `USD ${(customQuoteUsdCents / 100).toFixed(2)}`
        : "Custom garments require a tailored quote."
      : price?.mode === "standard"
        ? `${price.currency} ${price.total.toFixed(2)}`
        : (priceError ?? price?.message ?? "Pricing unavailable");

  // Shown in PriceCard's secondary-line slot only once quoted -- surfaces
  // the admin's note (if any) and always warns that further edits clear
  // the quote (matches actionUpdateDraft's invalidation rule exactly).
  const quotedSecondaryNote =
    state.product === "CUSTOM" && customQuoteUsdCents != null
      ? [customQuoteNote, "Quoted by our team. Changing your selection will require a new quote."]
          .filter(Boolean)
          .join(" ")
      : undefined;

  const selectionSummary = [
    state.product === "FITTED"
      ? "FITTED"
      : state.product === "OVERSIZED"
        ? "OVERSIZED"
        : "BESPOKE",
    state.color === "BLACK" ? "BLACK" : "WHITE",
    currentFabric.gsm.replace(" Cotton", ""),
  ].join(" / ");


  // The CTA is enabled when the selection is complete AND either: a paid
  // product has a ready price, a Bespoke build has an admin quote, or a
  // Bespoke build has no quote yet (the CTA then opens a no-payment
  // request -- no price required).
  const isBespokeRequestCta = state.product === "CUSTOM" && customQuoteUsdCents == null;
  const canCheckout =
    Boolean(state.product && state.color && state.fabric) &&
    (isBespokeRequestCta ||
      (state.product === "CUSTOM" ? customQuoteUsdCents != null : price?.mode === "standard"));

  // Canonical placement geometry -- the same shared config the server
  // compositor and TryOn3DPreview use (src/studio/render/placement-config.ts
  // via placement-css.ts). The bespoke canvas is forced to the same 1:1
  // aspect ratio as the template images (.studio-bespoke-canvas in
  // app/globals.css), so this box lands in the same relative position here
  // as everywhere else -- no second, canvas-tuned table.
  // Same client-side trim-to-visible-content fix as TryOn3DPreview -- see
  // useTrimmedArtworkUrl.ts. Kept as a SEPARATE value from `artworkUrl`
  // (only used for the overlay <img src>) because BespokeModal also uses
  // the raw `artworkUrl` prop for asset-grid "is this the active asset"
  // identity comparisons, which must keep comparing against the real,
  // untrimmed asset URL.
  const bespokeOverlayArtworkUrl = useTrimmedArtworkUrl(artworkUrl);

  // The popup's canvas is the FLAT tee, not the model photo, so the
  // canonical template-space placement box has to be expressed in the flat
  // tee's own canvas fractions before it can be used as a CSS box here --
  // otherwise a box tuned against a photo where the garment covers ~60% of
  // the width lands somewhere else entirely on a tee that fills its canvas.
  // getEditorPlacementStyle does exactly that remap (through both surfaces'
  // garment frames); it is NOT a second, canvas-tuned placement table.
  const bespokeArtworkStyle = useMemo(() => {
    if (!activePlacement) return {};
    return getEditorPlacementStyle(state.product, state.color, activePlacement);
  }, [activePlacement, state.product, state.color]);

  // What the Live Model Preview (outside the popup) shows on the model.
  //
  // The popup's own canvas is now permanently the flat editor tee -- it is
  // where the t-shirt gets BUILT, so it has to stay the thing being built
  // and stay draggable. That makes this preview the only place a photoreal
  // result can land, so it shows the best available one: the Gemini AI
  // mockup while it is fresh, otherwise the deterministic Print Mockup,
  // otherwise (both stale/absent) TryOn3DPreview's own model photo with
  // the live artwork overlay.
  //
  // Preferring the AI mockup only while it is FRESH matters: both mockups
  // are invalidated by the same live fingerprint (see isAiMockupStale /
  // isPrintMockupStale), so the instant the user drags, zooms or swaps
  // artwork this falls back rather than leaving a stale photo of the
  // previous design on the model.
  // Per garment side: the fresh AI mockup, else the print mockup (stale
  // when its fingerprint no longer matches that side's live design).
  const modelPreviewMockups = useMemo(() => {
    const pick = (side: "front" | "back") => {
      const live = liveFingerprints[side];
      const m = sideMockups[side];
      if (live && m.aiUrl && m.aiFp === live) return { url: m.aiUrl, isStale: false };
      return { url: live ? m.printUrl : null, isStale: !live || m.printFp !== live };
    };
    return { front: pick("front"), back: pick("back") };
    // sideMockups is rebuilt every render from the state values listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFingerprints, printMockupUrl, printMockupFingerprint, aiMockupUrl, aiMockupFingerprint, backPrintMockupUrl, backPrintMockupFingerprint, backAiMockupUrl, backAiMockupFingerprint]);

  // The other artworks on the side being edited, drawn on the popup's flat
  // tee exactly like the active one (editor-space placement box + the
  // stored template-space offset converted with toEditorOffset), but not
  // draggable -- clicking one makes it the artwork being edited.
  const bespokeOtherLayers = useMemo(() => {
    const side = getPlacementSide(activePlacement);
    return otherLayers
      .filter((layer) => getPlacementSide(layer.placement) === side)
      .map((layer) => {
        const style = getEditorPlacementStyle(state.product, state.color, layer.placement);
        const base = typeof style.transform === "string" ? style.transform : "";
        const offset = toEditorOffset(layer, state.product, state.color, layer.placement);
        const { x: offsetX, y: offsetY } = artworkOffsetPx(offset, bespokeCanvasWidth);
        return {
          placement: layer.placement,
          url: layer.url,
          style,
          transform: `${base} translate(${offsetX}px, ${offsetY}px) scale(${layer.scale}) rotate(${layer.rotation}deg)`.trim(),
        };
      });
  }, [activePlacement, bespokeCanvasWidth, otherLayers, state.color, state.product]);

  // "+ADD" (Selected Artwork): put a new artwork on the next free
  // placement -- the active one if it's empty, else the first empty card --
  // then open the file picker.
  function addAnotherArtwork() {
    if (!activeLayer) {
      fileInputRef.current?.click();
      return;
    }
    if (allLayers.length >= MAX_ARTWORK_LAYERS) {
      setMockupError(`You can add up to ${MAX_ARTWORK_LAYERS} artworks. Remove one to add another.`);
      return;
    }
    const free = placementCards.find((card) => !selectedPlacements.includes(card.key));
    if (!free) return;
    switchPlacement(free.key);
    fileInputRef.current?.click();
  }

  const bespokeShirtSrc = useMemo(
    () => getBespokeShirtImage(state.product, state.color, activePlacement),
    [activePlacement, state.color, state.product],
  );

  const bespokeArtworkTransform = useMemo(() => {
    const baseTransform =
      typeof bespokeArtworkStyle.transform === "string" ? bespokeArtworkStyle.transform : "";
    // artworkTransform is stored in TEMPLATE space (that's what gets
    // persisted, validated and rendered); this canvas is the flat tee, so
    // the offset is converted into the tee's own canvas-width units first
    // -- the exact counterpart of the inverse conversion applied to drag
    // input in handleArtworkPointerMove.
    const editorOffset = toEditorOffset(artworkTransform, state.product, state.color, activePlacement);
    const { x: offsetX, y: offsetY } = artworkOffsetPx(editorOffset, bespokeCanvasWidth);
    // P3-21c: rotate last, about the artwork's own center -- matches the
    // server compositor (src/studio/render/composite.ts).
    return `${baseTransform} translate(${offsetX}px, ${offsetY}px) scale(${artworkTransform.scale}) rotate(${artworkTransform.rotation}deg)`.trim();
  }, [
    activePlacement,
    artworkTransform,
    bespokeArtworkStyle,
    bespokeCanvasWidth,
    state.color,
    state.product,
  ]);

  // Single user-facing action: "Generate AI Mockup" always (re)generates a
  // fresh, deterministic Print Mockup from the CURRENT Studio artwork state
  // first, then feeds that into Gemini -- there is no separate
  // user-triggered Print Mockup step. This is unconditional (not gated on
  // isPrintMockupStale) so the AI mockup can never be generated against a
  // Print Mockup that doesn't correspond to what's currently on screen;
  // when nothing changed, /api/mockups/print's own fingerprint cache makes
  // the repeat call a cheap no-op re-render. The AI route
  // (app/api/mockups/nanobanana/route.ts) then consumes only {buildId,
  // draftId} and resolves the Print Mockup, garment reference, product,
  // color, and placement itself, server-side, from rows the draft already
  // owns -- no client-captured DOM screenshot, raw artwork, or transform
  // numbers are ever sent to it.
  // Resolves true when a fresh AI mockup was generated. Returned directly
  // (not read back from aiMockupUrl state) because saveBespokeTShirt awaits
  // this and its own closure would still see the pre-generation state.
  // Generates one garment side's mockups for the CURRENT design: the
  // deterministic Print Mockup (what the model preview shows meanwhile),
  // then the Gemini AI mockup with every artwork on that side. Resolves
  // true on success. Returns its result directly rather than via state:
  // saveBespokeTShirt awaits it and its own closure would still see the
  // pre-generation state.
  async function generateSideMockups(side: "front" | "back", layers: EditorLayer[]): Promise<boolean> {
    const sideLayers = layersForSide(layers, side).map(({ placement, assetId, x, y, scale, rotation }) => ({
      placement,
      assetId,
      x,
      y,
      scale,
      rotation,
    }));
    if (!sideLayers.length) return true;
    const body = JSON.stringify({ buildId, draftId, product: mockupProduct, color: mockupColor, layers: sideLayers });

    try {
      const printRes = await fetch("/api/mockups/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const print = await printRes.json().catch(() => null);
      if (!printRes.ok || !print?.ok || typeof print.imageUrl !== "string") {
        throw new Error(print?.error ?? "Could not generate print mockup.");
      }
      const printFp = typeof print.fingerprint === "string" ? print.fingerprint : null;
      if (side === "back") {
        setBackPrintMockupUrl(print.imageUrl);
        setBackPrintMockupFingerprint(printFp);
      } else {
        setPrintMockupUrl(print.imageUrl);
        setPrintMockupFingerprint(printFp);
      }

      const aiRes = await fetch("/api/mockups/nanobanana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const ai = await aiRes.json().catch(() => null);
      if (!aiRes.ok || !ai?.ok) throw new Error(ai?.error ?? "Could not generate mockup.");
      if (typeof ai.imageUrl !== "string" || !ai.imageUrl) throw new Error("Gemini did not return a mockup image.");
      const aiFp = typeof ai.fingerprint === "string" && ai.fingerprint ? ai.fingerprint : null;
      if (side === "back") {
        setBackAiMockupUrl(ai.imageUrl);
        setBackAiMockupFingerprint(aiFp);
      } else {
        setAiMockupUrl(ai.imageUrl);
        setAiMockupFingerprint(aiFp);
      }
      return true;
    } catch (error) {
      setMockupError(error instanceof Error ? error.message : "Could not generate mockup.");
      return false;
    }
  }

  const authPopup =
    mounted && showAuthModal
      ? createPortal(
          <AuthModal
            authMode={authMode}
            authEmail={authEmail}
            authPassword={authPassword}
            authError={authError}
            authPending={authPending}
            submitDisabled={authPending || status === "loading"}
            onClose={closeAuthModal}
            onSelectLogin={() => switchAuthMode("login")}
            onSelectSignup={() => switchAuthMode("signup")}
            onToggleMode={toggleAuthMode}
            onSubmit={handleAuthSubmit}
            onEmailChange={(event) => setAuthEmail(event.target.value)}
            onPasswordChange={(event) => setAuthPassword(event.target.value)}
          />,
          document.body,
        )
      : null;

  const customPopup =
    mounted && showCustomPopup
      ? createPortal(
          <ArtworkModal
            onClose={() => setShowCustomPopup(false)}
            onContinueCustomRequest={continueCustomRequest}
          />,
          document.body,
        )
      : null;

  const sizeGuideModal =
    mounted && showSizeGuide
      ? createPortal(
          <SizeGuideModal
            modelNote="Model is 5ft 8' and wears size XS."
            whatsappUrl={WHATSAPP_URL}
            onClose={() => setShowSizeGuide(false)}
          />,
          document.body,
        )
      : null;

  const bespokeModal =
    mounted && showBespokeModal
      ? createPortal(
          <BespokeModal
            bespokeShirtSrc={bespokeShirtSrc}
            artworkUrl={artworkUrl}
            overlayArtworkUrl={bespokeOverlayArtworkUrl}
            product={state.product}
            color={state.color}
            bespokeArtworkStyle={bespokeArtworkStyle}
            bespokeArtworkTransform={bespokeArtworkTransform}
            placementCards={placementCards}
            selectedPlacements={selectedPlacements}
            activePlacement={activePlacement}
            activeArtworkAsset={activeArtworkAsset}
            artworkTransform={artworkTransform}
            mockupPending={mockupPending}
            savePending={savePending}
            mockupError={mockupError}
            userAssets={userAssets}
            selectedPrimaryAssetId={state.primaryAssetId}
            attachingAssetId={attachingAssetId}
            previewRef={previewRef}
            onClose={() => setShowBespokeModal(false)}
            onArtworkPointerDown={handleArtworkPointerDown}
            onArtworkPointerMove={handleArtworkPointerMove}
            onArtworkPointerUp={handleArtworkPointerUp}
            onPlacementClick={handlePlacementClick}
            onAddArtworkClick={() => fileInputRef.current?.click()}
            onZoomOut={() => changeArtworkScale(artworkTransform.scale - 0.1)}
            onArtworkScaleChange={handleArtworkScaleChange}
            onZoomIn={() => changeArtworkScale(artworkTransform.scale + 0.1)}
            onResetArtworkTransform={resetArtworkTransform}
            onSelectAsset={(asset) => void selectAsset(asset)}
            otherLayers={bespokeOtherLayers}
            layers={[...allLayers]
              // Stable order (the placement cards' order), so cards don't
              // jump around as the artwork being edited changes.
              .sort(
                (a, b) =>
                  placementCards.findIndex((card) => card.key === a.placement) -
                  placementCards.findIndex((card) => card.key === b.placement),
              )
              .map((layer) => ({ placement: layer.placement, url: layer.url, fileName: layer.fileName }))}
            onSelectLayer={switchPlacement}
            onRemoveLayer={removeLayer}
            onAddAnotherArtwork={addAnotherArtwork}
            onDropAsset={dropAssetOnShirt}
            onRemoveAsset={(asset) => void removeUserAsset(asset)}
            removingAssetId={removingAssetId}
            onSaveTShirt={() => void saveBespokeTShirt()}
          />,
          document.body,
        )
      : null;
  return (
    <>
      {authPopup}
      {customPopup}
      {sizeGuideModal}
      {bespokeModal}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void handleUpload(file);
          event.currentTarget.value = "";
        }}
      />

      <main ref={shellRef} className="studio-builder-shell">
        <div className="studio-builder-frame">
          <div className="studio-builder-grid">
            <section className="studio-left-panel" aria-label="Product controls">
              <div className="studio-panel-header">
                <h1 className="studio-title">THE&nbsp;STUDIO</h1>   
                </div>

              <div className="studio-left-stack">
                <ProductSelector
                  product={state.product}
                  onSelectFitted={selectFittedProduct}
                  onSelectOversized={selectOversizedProduct}
                  onRequestCustom={openCustomRequestPopup}
                />

                <ColorSelector
                  color={state.color}
                  currentColorLabel={currentColorLabel}
                  customColourIcon={CUSTOM_COLOUR_ICON}
                  onSelectBlack={selectBlackColor}
                  onSelectWhite={selectWhiteColor}
                  onRequestCustomColour={openCustomRequestPopup}
                />

                <FabricSelector
                  menuRef={fabricMenuRef}
                  currentFabric={currentFabric}
                  fabricOptions={fabricOptions}
                  selectedFabric={state.fabric}
                  open={fabricOpen}
                  onToggleOpen={toggleFabricMenu}
                  onSelectFabric={selectFabric}
                />
                <button
                  type="button"
                  className="studio-build-button"
                  onClick={openBespokeBuilder}
                >
                  Build Your T-Shirt
                </button>

                {mockupError && !showBespokeModal ? (
                  <div className="studio-bespoke-error" role="alert">
                    {mockupError}
                  </div>
                ) : null}

                <div className="studio-save-row">
                  <span
                    className={cn(
                      "studio-save-dot",
                      isPending ? "studio-save-dot-pending" : "",
                    )}
                  />
                  <span>{isPending ? "Saving..." : "Saved"}</span>
                  <span className="studio-save-divider" />
                  <span>{placementsCount} placements</span>
                </div>
              </div>
            </section>

            {/* هنا بنباصي الـ activePlacement للبريفيو عشان يلف معاه */}
            <TryOn3DPreview
              product={state.product}
              color={state.color}
              artworks={allLayers}
              activePlacement={activePlacement}
              mockups={modelPreviewMockups}
            />

            <section className="studio-right-panel" aria-label="Order controls">
              <div className="studio-right-sticky">
                <PriceCard
                  priceText={priceText}
                  onRetry={priceError ? () => setPricingRetryToken((token) => token + 1) : undefined}
                  secondaryNote={quotedSecondaryNote}
                />

                <div className="studio-right-divider" />

                <QuantitySelector
                  quantity={qty}
                  onDecrease={decreaseQuantity}
                  onQuantityChange={handleQuantityChange}
                  onIncrease={increaseQuantity}
                />
                <div className="studio-right-divider studio-right-divider-soft" />

                <div className="studio-field-block">
                  <div className="studio-size-header">
                    <div>
                      <div className="studio-right-label">Size</div>
                    </div>

                    <button
                      type="button"
                      className="studio-size-guide-link"
                      onClick={() => setShowSizeGuide(true)}
                    >
                      Size Guide
                    </button>
                  </div>

                  <div className="studio-size-grid">
                    {(["S", "M", "L", "XL"] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setSelectedSize(size)}
                        className={cn(
                          "studio-size-button",
                          selectedSize === size ? "studio-size-button-active" : "",
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="studio-summary-card studio-summary-card-sticky">
                  <div className="studio-summary-label">Selection Summary</div>
                  <div className="studio-summary-value">{selectionSummary}</div>
                </div>

                <div className="studio-action-row">
<CheckoutButton
  onCheckout={openCheckout}
  disabled={!canCheckout || savePending}
  label={isBespokeRequestCta ? "Request a Quote" : "Add to Bag"}
/>

                  <button
                    type="button"
                    className="studio-wishlist-button"
                    onClick={() => void handleAddToWishlist()}
                    disabled={wishlistPending || inWishlist}
                  >
                    {inWishlist
                      ? "In Your Wishlist"
                      : wishlistPending
                        ? "Adding..."
                        : "Add To Wishlist"}
                  </button>
                </div>
                {wishlistError ? (
                  <p className="mt-2 text-xs text-red-600">{wishlistError}</p>
                ) : null}

                <div className="studio-right-divider" />

                <div className="studio-product-info">
                  <div className="studio-info-title">Product Info</div>

                  {/* Copy ends here to match the Figma frame, which sets
                      the Product Info paragraph as "Constructed from 100%
                      organic cotton, the Archive" and hugs to it. */}
                  <p>Constructed from 100% organic cotton, the Archive</p>
                </div>

                <div className="studio-model-note">
                  Model is 5ft 8&apos; and wears size XS.
                  <span> SIZE GUIDE</span>
                </div>

                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="studio-live-assistance"
                >
                  Live Assistance
                </a>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
