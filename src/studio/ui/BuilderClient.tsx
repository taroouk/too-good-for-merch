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

import { actionUpdateDraft } from "src/actions/build-actions";
import { actionSaveArtwork } from "src/actions/artwork-actions";
import { actionAddToWishlist } from "src/actions/wishlist-actions";
import {
  actionAttachExistingAsset,
  actionCreateAssetForBuilder,
} from "src/actions/asset-actions";
import { computeMockupFingerprint } from "src/db/mockup";
import { WHATSAPP_URL } from "src/lib/whatsapp";
// transform.ts and placement-css.ts have zero server-only imports (no
// node:fs, no sharp) -- safe to import directly from a client component.
// Do not import from the src/studio/render barrel (index.ts) here, since
// it also re-exports server-only modules (templates.ts uses
// node:fs/promises).
import { BASELINE_RENDER_DPI, getEffectiveScaleBounds } from "src/studio/render/transform";
import { getPlacementStyle } from "src/studio/render/placement-css";
import { useMeasuredRefCallback } from "src/studio/ui/useContainerSize";
import {
  placementsFromCustomNotes,
  upsertPlacementsInNotes,
  type PlacementKey,
} from "src/pricing/placements";
import CheckoutButton from "src/studio/ui/components/CheckoutButton";
import ColorSelector from "src/studio/ui/components/ColorSelector";
import FabricSelector from "src/studio/ui/components/FabricSelector";
import PriceCard from "src/studio/ui/components/PriceCard";
import ProductSelector from "src/studio/ui/components/ProductSelector";
import QuantitySelector from "src/studio/ui/components/QuantitySelector";
import ArtworkModal from "src/studio/ui/modals/ArtworkModal";
import AuthModal from "src/studio/ui/modals/AuthModal";
import BespokeModal from "src/studio/ui/modals/BespokeModal";
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
};

type CreatedAssetDTO = Awaited<ReturnType<typeof actionCreateAssetForBuilder>>;

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
};

type SizeOption = "S" | "M" | "L" | "XL";
type AuthMode = "login" | "signup";
type ArtworkTransform = {
  x: number;
  y: number;
  scale: number;
};

const CUSTOM_COLOUR_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAANCAYAAABy6+R8AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAANhJREFUeAGFkssRgkAQRGfVg8c1AvHmUSOAEAyBEAjBDMQIKCNAI8CjNzUCzECMQHul1xp+ZVe9WgZ2droBkaYiUIAneHPNwUYGlIEriIHlPcu6BDu/ccTV3TBgzY1WTa7AAsx0oz/JKaCtmHXO6X5qyYO+GbRn27rW9RakhmHXHH0AR+nK27qDcMKTKlobklGTX0Kfc/mvQFSmlF77NmUkZ4zEj3UP3RtyuR6qqWCGG+2fuf6UcHTQaur9E8ZcL1IHdFZWUn/MKViCU7vJSDdHBELWe9pr6AOp5C+yKrBIdgAAAABJRU5ErkJggg==";
const DEFAULT_ARTWORK_TRANSFORM: ArtworkTransform = { x: 0, y: 0, scale: 1 };
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

function clampArtworkScale(scale: number) {
  if (!Number.isFinite(scale)) return 1;
  return Math.max(0.4, Math.min(2.4, scale));
}

function getBespokeShirtImage(
  product: ProductType | null,
  color: GarmentColor | null,
  placement: PlacementKey,
) {
  const isBack = placement.includes("BACK");
  const isOversized = product === "OVERSIZED";
  const isBlack = color === "BLACK";

  if (isOversized) {
    if (isBack) return isBlack ? "/images/Oversized Black Back.png" : "/images/Oversized White Back.png";
    return isBlack ? "/images/Oversized Black.png" : "/images/Oversized White.png";
  }

  if (isBack) return isBlack ? "/images/TGFM Black Back.png" : "/images/TGFM White Back.png";
  return isBlack ? "/images/TGFM Black.png" : "/images/TGFM White.png";
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
}: BuilderClientProps) {
  const router = useRouter();
  const { status } = useSession();
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [state, setState] = useState<DraftDTO>({
    ...draft,
    product: draft.product ?? ("FITTED" as ProductType),
    color: draft.color ?? ("WHITE" as GarmentColor),
    fabric: draft.fabric ?? ("ESSENTIALS_170" as FabricType),
    quantity: draft.quantity ?? 1,
  });

  const [selectedPlacements, setSelectedPlacements] = useState<PlacementKey[]>(() =>
    placementsFromCustomNotes(draft.customNotes),
  );
  const [activePlacement, setActivePlacement] = useState<PlacementKey>(
    (typeof initialArtworkPlacement?.placement === "string" && initialArtworkPlacement.placement
      ? (initialArtworkPlacement.placement as PlacementKey)
      : "CENTER_FRONT"),
  );
  const [userAssets, setUserAssets] = useState<UserAssetDTO[]>(initialUserAssets);
  const [, setUploadName] = useState("");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [artworkTransform, setArtworkTransform] = useState<ArtworkTransform>(() => {
    const p = initialArtworkPlacement;
    if (!p) return DEFAULT_ARTWORK_TRANSFORM;
    return {
      x: typeof p.x === "number" && Number.isFinite(p.x) ? p.x : 0,
      y: typeof p.y === "number" && Number.isFinite(p.y) ? p.y : 0,
      scale: clampArtworkScale(typeof p.scale === "number" ? p.scale : 1),
    };
  });
  // Canonical saved-artwork URL (Artwork model). Set on "Save T-Shirt" and
  // seeded from the persisted value on load so a refresh/re-open shows the
  // exact saved image without regenerating anything.
  const [savedArtworkUrl, setSavedArtworkUrl] = useState<string | null>(initialSavedArtworkUrl);
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
  const pricingPlacements = useMemo<PlacementKey[]>(
    () => (selectedPlacements.length ? selectedPlacements : ["CENTER_FRONT"]),
    [selectedPlacements],
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

  const placementCards: Array<{ key: PlacementKey; label: string; image: string }> = [
    { key: "FULL_FRONT", label: "Full Front", image: "/images/Frame 1.png" },
    { key: "CENTER_FRONT", label: "Center Front", image: "/images/Frame 2.png" },
    { key: "LEFT_CHEST", label: "Left Chest", image: "/images/Frame 3.png" },
    { key: "RIGHT_CHEST", label: "Right Chest", image: "/images/Frame 4.png" },
    { key: "FULL_BACK", label: "Full Back", image: "/images/Frame 5.png" },
    { key: "CENTER_BACK", label: "Center Back", image: "/images/Frame 6.png" },
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
  // there is exactly one live fingerprint, using the same rotation (always
  // 0 today, no client rotation control yet) and dpi (BASELINE_RENDER_DPI,
  // since generatePrintMockup never overrides it) the server will actually
  // use, so a fresh print mockup doesn't immediately appear stale against
  // its own just-persisted fingerprint. Both isPrintMockupStale and
  // isAiMockupStale compare against it.
  const livePrintFingerprint = useMemo(
    () =>
      computeMockupFingerprint({
        assetId: state.primaryAssetId ?? null,
        placement: activePlacement,
        x: artworkTransform.x,
        y: artworkTransform.y,
        scale: artworkTransform.scale,
        // Resolved (never "CUSTOM") -- matches what generatePrintMockup/
        // generateNanoBananaMockup below actually send for Bespoke, so this
        // fingerprint is byte-for-byte what the server computes and a
        // freshly-generated Bespoke mockup is never immediately marked
        // stale against its own fingerprint. Identity for FITTED/OVERSIZED,
        // so no behavior change for any non-Bespoke build.
        product: resolveMockupProduct(state.product),
        color: resolveMockupColor(state.color),
        rotation: 0,
        dpi: BASELINE_RENDER_DPI,
      }),
    [artworkTransform, activePlacement, state.primaryAssetId, state.product, state.color],
  );

  const isPrintMockupStale = useMemo(() => {
    if (!printMockupFingerprint) return false;
    return printMockupFingerprint !== livePrintFingerprint;
  }, [printMockupFingerprint, livePrintFingerprint]);

  const isAiMockupStale = useMemo(() => {
    if (!aiMockupFingerprint) return false;
    return aiMockupFingerprint !== livePrintFingerprint;
  }, [aiMockupFingerprint, livePrintFingerprint]);

  const shouldShowGenerateAiButton = useMemo(() => {
    // Bespoke (state.product === "CUSTOM") is a legitimate case now too --
    // generatePrintMockup/generateNanoBananaMockup below resolve it onto
    // the FITTED/OVERSIZED template it's already being previewed against
    // (see resolveMockupProduct/resolveMockupColor), so this button is not
    // gated on product type.
    if (!state.primaryAssetId || !activeArtworkAsset) return false;
    if (!aiMockupUrl) return true;
    return isAiMockupStale;
  }, [aiMockupUrl, isAiMockupStale, state.primaryAssetId, activeArtworkAsset]);

  function discardPrintMockup() {
    setPrintMockupUrl(null);
    setPrintMockupFingerprint(null);
  }

  function discardAiMockup() {
    setAiMockupUrl(null);
    setAiMockupFingerprint(null);
  }

  // A placement/product/color/transform change invalidates both tracks --
  // both compare against livePrintFingerprint (see above).
  function discardMockups() {
    discardPrintMockup();
    discardAiMockup();
    setMockupError(null);
  }

  useEffect(() => {
    setMounted(true);
  }, []);

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
          : `/checkout?buildId=${buildId}`,
      );
    } else {
      setShowBespokeModal(true);
    }
  }, [buildId, checkoutAfterAuth, router, showAuthModal, status, state.product, customQuoteUsdCents]);

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

  async function handleUpload(file: File) {
    if (!ALLOWED_ARTWORK_MIME_TYPES.has(file.type)) {
      setMockupError("Artwork must be PNG, JPG, WEBP, or SVG.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_ARTWORK_BYTES) {
      setMockupError("Artwork file must be smaller than 10MB.");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setUploadName(file.name);
    setArtworkUrl(localUrl);
    setArtworkTransform(DEFAULT_ARTWORK_TRANSFORM);
    discardMockups();

    const tempId = `temp-${Date.now()}`;
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
          setUserAssets((prev) =>
            prev.map((a) =>
              a.id === tempId
                ? {
                    id: res.id,
                    buildId: res.buildId ?? buildId,
                    url: res.url || localUrl,
                    fileName: res.fileName ?? file.name,
                  }
                : a,
            )
          );
          save({
            ...state,
            primaryAssetId: res.id,
          });
        }
      }).catch((error) => {
        setUserAssets((prev) => prev.filter((asset) => asset.id !== tempId));
        setArtworkUrl((current) => (current === localUrl ? null : current));
        setUploadName("");
        setMockupError(error instanceof Error ? error.message : "Could not upload artwork.");
        URL.revokeObjectURL(localUrl);
      });
    });
  }

  async function selectAsset(asset: UserAssetDTO) {
    setArtworkUrl(asset.url);
    setUploadName(asset.fileName);
    setArtworkTransform(DEFAULT_ARTWORK_TRANSFORM);
    discardMockups();

    if (!asset.buildId || asset.buildId === buildId) {
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
      };

      setUserAssets((prev) =>
        prev.some((item) => item.id === nextAsset.id)
          ? prev.map((item) => (item.id === nextAsset.id ? nextAsset : item))
          : [nextAsset, ...prev],
      );
      setArtworkUrl(nextAsset.url);
      setUploadName(nextAsset.fileName);
      save({ ...state, primaryAssetId: nextAsset.id });
    } catch {
      alert("Could not load this artwork.");
    } finally {
      setAttachingAssetId(null);
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
    setArtworkTransform({
      // x/y are fractions of the preview container's own width (see
      // src/studio/render/transform.ts), not raw px -- round to decimal
      // precision like scale, not to the nearest integer.
      x: Math.round(next.x * 10000) / 10000,
      y: Math.round(next.y * 10000) / 10000,
      scale: clampArtworkScale(next.scale),
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

    // previewRef is the (now square, see .studio-bespoke-canvas) drag
    // surface -- convert the raw pointer pixel delta into a fraction of
    // its live rendered width, matching the units resolvePlacement expects
    // server-side. Measured live (not cached at pointerdown) since it's a
    // cheap read and keeps this correct even if the canvas were to resize
    // mid-drag.
    const containerWidth = previewNodeRef.current?.getBoundingClientRect().width;
    if (!containerWidth) return;

    updateArtworkTransform({
      ...dragState.origin,
      x: dragState.origin.x + (event.clientX - dragState.startX) / containerWidth,
      y: dragState.origin.y + (event.clientY - dragState.startY) / containerWidth,
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
        : `/checkout?buildId=${buildId}`,
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
            : `/checkout?buildId=${buildId}`,
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

  function continueCustomRequest() {
    save({
      ...state,
      product: "CUSTOM" as ProductType,
      customNotes: state.customNotes ?? "",
    });

    setShowCustomPopup(false);
    openBespokeBuilder();
  }

  function togglePlacement(key: PlacementKey) {
    const next = selectedPlacements.includes(key)
      ? selectedPlacements.filter((item) => item !== key)
      : selectedPlacements.length >= 4
        ? selectedPlacements
        : [...selectedPlacements, key];

    setSelectedPlacements(next);

    save({
      ...state,
      customNotes: upsertPlacementsInNotes(state.customNotes, next),
    });
  }

  function selectFittedProduct() {
    save({
      ...state,
      product: "FITTED" as ProductType,
      // HEAVYWEIGHT_300 is hidden for FITTED above (no configured price) --
      // fall back rather than leave an unpriced combination in state.
      fabric: state.fabric === "HEAVYWEIGHT_300" ? ("SIGNATURE_200" as FabricType) : state.fabric,
    });
  }

  function selectOversizedProduct() {
    save({
      ...state,
      product: "OVERSIZED" as ProductType,
    });
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
    togglePlacement(key);
    setActivePlacement(key);
  }

  // "Save T-Shirt" just persists/closes -- it must NOT force product to
  // CUSTOM. This modal (openBespokeBuilder, the "Build Your T-Shirt"
  // button) is also the FITTED/OVERSIZED artwork editor, not only the
  // Bespoke request flow, so overwriting product here silently downgraded
  // an already-chosen FITTED/OVERSIZED selection to CUSTOM on every save,
  // which then failed generatePrintMockup's product check on the next
  // "Generate AI Mockup" click even though the user never touched product.
  // continueCustomRequest() above is the only place that should set CUSTOM.
  async function saveBespokeTShirt() {
    save({ ...state });

    // Persist the EXACT generated artwork + the current canvas transform as
    // a stable, owner-scoped Artwork (src/actions/artwork-actions.ts) so it
    // survives navigation/refresh and can be referenced by Wishlist /
    // Bespoke / Admin. Upserts on the source mockup -- a repeat save never
    // creates a second record. Silently a no-op if nothing is generated yet.
    if (aiMockupUrl && state.primaryAssetId) {
      setSavePending(true);
      try {
        const result = await actionSaveArtwork(buildId, {
          placement: activePlacement,
          x: artworkTransform.x,
          y: artworkTransform.y,
          scale: artworkTransform.scale,
          rotation: 0,
        });
        setSavedArtworkUrl(result.url);
      } catch (error) {
        setMockupError(error instanceof Error ? error.message : "Could not save your artwork.");
      } finally {
        setSavePending(false);
      }
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
  const bespokeArtworkStyle = useMemo(() => {
    if (!activePlacement) return {};
    const resolvedProduct: ProductType = state.product === "OVERSIZED" ? "OVERSIZED" : "FITTED";
    const resolvedColor: GarmentColor = state.color === "BLACK" ? "BLACK" : "WHITE";
    return getPlacementStyle(resolvedProduct, resolvedColor, activePlacement);
  }, [activePlacement, state.product, state.color]);

  const bespokeShirtSrc = useMemo(
    () => getBespokeShirtImage(state.product, state.color, activePlacement),
    [activePlacement, state.color, state.product],
  );

  const bespokeArtworkTransform = useMemo(() => {
    const baseTransform =
      typeof bespokeArtworkStyle.transform === "string" ? bespokeArtworkStyle.transform : "";
    const offsetX = artworkTransform.x * bespokeCanvasWidth;
    const offsetY = artworkTransform.y * bespokeCanvasWidth;
    return `${baseTransform} translate(${offsetX}px, ${offsetY}px) scale(${artworkTransform.scale})`.trim();
  }, [artworkTransform, bespokeArtworkStyle, bespokeCanvasWidth]);

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
  async function generateNanoBananaMockup() {
    if (!state.primaryAssetId || !activeArtworkAsset) {
      setMockupError("Select artwork first.");
      return;
    }

    setMockupPending(true);
    setMockupError(null);

    try {
      // The Print Mockup remains an internal step (canonical artifact +
      // what TryOn3DPreview shows), but the AI route no longer reads it:
      // it resolves geometry itself from the same live transform sent
      // below, so this call and the one after it are independent, not a
      // read-after-write dependency.
      const printResult = await generatePrintMockup();
      if (!printResult.ok) {
        throw new Error(printResult.error);
      }

      const response = await fetch("/api/mockups/nanobanana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildId,
          draftId,
          assetId: state.primaryAssetId,
          placement: activePlacement,
          x: artworkTransform.x,
          y: artworkTransform.y,
          scale: artworkTransform.scale,
          // Resolved -- see resolveMockupProduct/resolveMockupColor and
          // generatePrintMockup below. Bespoke sends the same template
          // choice it's already being previewed against, never "CUSTOM"
          // (which this route's own PRODUCTS/COLORS enums would reject).
          product: resolveMockupProduct(state.product),
          color: resolveMockupColor(state.color),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? "Could not generate mockup.");
      }

      if (typeof data.imageUrl !== "string" || !data.imageUrl) {
        throw new Error("Gemini did not return a mockup image.");
      }

      setAiMockupUrl(data.imageUrl);
      if (typeof data.fingerprint === "string" && data.fingerprint) {
        setAiMockupFingerprint(data.fingerprint);
      }
    } catch (error) {
      discardAiMockup();
      setMockupError(
        error instanceof Error ? error.message : "Could not generate mockup.",
      );
    } finally {
      setMockupPending(false);
    }
  }

  // Deterministic Print Mockup: unlike the Gemini flow below, the server
  // composites from the raw uploaded artwork bytes it already has, so this
  // only needs to send transform/placement numbers -- no client-side canvas
  // export required. Returns a result (not void): generateNanoBananaMockup
  // awaits this to gate AI generation on a fresh Print Mockup, and needs
  // the outcome directly -- state setters here don't update this
  // function's own closure, so the caller can't reliably learn success/
  // failure by re-reading printMockupUrl/printMockupError afterwards.
  async function generatePrintMockup(): Promise<
    { ok: true; url: string; fingerprint: string | null } | { ok: false; error: string }
  > {
    if (!state.primaryAssetId || !activeArtworkAsset) {
      return { ok: false, error: "Select artwork first." };
    }

    // Bespoke (state.product === "CUSTOM", or a "Request custom colour"
    // state.color === "CUSTOM") has no template of its own to render onto
    // -- resolveMockupProduct/resolveMockupColor map it onto the exact same
    // FITTED/OVERSIZED + BLACK/WHITE template the canvas is already
    // previewing (getBespokeShirtImage uses the identical fallback), so
    // this always has a valid, already-seen-on-screen template rather than
    // rejecting Bespoke outright.
    const mockupProduct = resolveMockupProduct(state.product);
    const mockupColor = resolveMockupColor(state.color);

    try {
      const response = await fetch("/api/mockups/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildId,
          draftId,
          assetId: state.primaryAssetId,
          placement: activePlacement,
          x: artworkTransform.x,
          y: artworkTransform.y,
          scale: artworkTransform.scale,
          product: mockupProduct,
          color: mockupColor,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? "Could not generate print mockup.");
      }

      if (typeof data.imageUrl !== "string" || !data.imageUrl) {
        throw new Error("The print mockup service did not return an image.");
      }

      setPrintMockupUrl(data.imageUrl);
      const fingerprint = typeof data.fingerprint === "string" && data.fingerprint ? data.fingerprint : null;
      if (fingerprint) {
        setPrintMockupFingerprint(fingerprint);
      }
      return { ok: true, url: data.imageUrl, fingerprint };
    } catch (error) {
      discardPrintMockup();
      const message = error instanceof Error ? error.message : "Could not generate print mockup.";
      return { ok: false, error: message };
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

  const bespokeModal =
    mounted && showBespokeModal
      ? createPortal(
          <BespokeModal
            generatedMockupUrl={aiMockupUrl ?? savedArtworkUrl}
            bespokeShirtSrc={bespokeShirtSrc}
            artworkUrl={artworkUrl}
            color={state.color}
            bespokeArtworkStyle={bespokeArtworkStyle}
            bespokeArtworkTransform={bespokeArtworkTransform}
            placementCards={placementCards}
            selectedPlacements={selectedPlacements}
            activePlacement={activePlacement}
            activeArtworkAsset={activeArtworkAsset}
            artworkTransform={artworkTransform}
            mockupPending={mockupPending}
            canGenerateMockup={Boolean(state.primaryAssetId)}
            shouldShowGenerateButton={shouldShowGenerateAiButton}
            isMockupStale={isAiMockupStale}
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
            onRemoveSelectedArtwork={removeSelectedArtwork}
            onAddArtworkClick={() => fileInputRef.current?.click()}
            onZoomOut={() => changeArtworkScale(artworkTransform.scale - 0.1)}
            onArtworkScaleChange={handleArtworkScaleChange}
            onZoomIn={() => changeArtworkScale(artworkTransform.scale + 0.1)}
            onResetArtworkTransform={resetArtworkTransform}
            onGenerateMockup={() => void generateNanoBananaMockup()}
            onSelectAsset={(asset) => void selectAsset(asset)}
            onSaveTShirt={saveBespokeTShirt}
          />,
          document.body,
        )
      : null;
  return (
    <>
      {authPopup}
      {customPopup}
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

      <main className="studio-builder-shell">
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
              artworkUrl={artworkUrl}
              activePlacement={activePlacement}
              artworkTransform={artworkTransform}
              generatedMockupUrl={printMockupUrl}
              isMockupStale={isPrintMockupStale}
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

                    <button type="button" className="studio-size-guide-link">
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
  label={isBespokeRequestCta ? "Request a Quote" : "Checkout"}
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

                  <p>
                    Constructed from 100% organic cotton, the Archive base is
                    refined for everyday wear and premium artwork application.
                  </p>
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
