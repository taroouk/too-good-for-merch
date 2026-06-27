"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
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
import {
  actionAttachExistingAsset,
  actionCreateAssetForBuilder,
} from "src/actions/asset-actions";
import { WHATSAPP_URL } from "src/lib/whatsapp";
import {
  placementsFromCustomNotes,
  upsertPlacementsInNotes,
  type PlacementKey,
} from "src/pricing/placements";
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
  draft: DraftDTO;
  placementsCount: number;
  initialUserAssets?: UserAssetDTO[];
  walletEnabled?: boolean;
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
const ALLOWED_ARTWORK_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
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

export default function BuilderClient({
  buildId,
  draft,
  placementsCount,
  initialUserAssets = [],
  walletEnabled = false,
}: BuilderClientProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
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
  const [activePlacement, setActivePlacement] = useState<PlacementKey>("CENTER_FRONT");
  const [userAssets, setUserAssets] = useState<UserAssetDTO[]>(initialUserAssets);
  const [, setUploadName] = useState("");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [artworkTransform, setArtworkTransform] = useState<ArtworkTransform>(
    DEFAULT_ARTWORK_TRANSFORM,
  );
  const [generatedMockupUrl, setGeneratedMockupUrl] = useState<string | null>(null);
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
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutAfterAuth, setCheckoutAfterAuth] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CARD" | "WALLET">("CARD");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutOrderId, setCheckoutOrderId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fabricMenuRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: ArtworkTransform;
  } | null>(null);

  const qty = useMemo(() => clampQty(Number(state.quantity ?? 1)), [state.quantity]);
  const pricingPlacements = useMemo<PlacementKey[]>(
    () => (selectedPlacements.length ? selectedPlacements : ["CENTER_FRONT"]),
    [selectedPlacements],
  );

  const fabricOptions = [
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
    setGeneratedMockupUrl(null);
    setMockupError(null);
  }, [activePlacement, state.color, state.primaryAssetId, state.product]);

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

      try {
        const res = await fetch("/api/pricing/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product: state.product,
            fabric: state.fabric,
            quantity: qty,
            placements: pricingPlacements,
          }),
        });

        const data = (await res.json()) as PriceResult;
        if (!cancelled) {
          setPrice(data);
        }
      } catch {
        if (!cancelled) {
          setPrice({
            mode: "custom",
            unit: null,
            total: null,
            currency: "USD",
            message: "Pricing unavailable",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingPrice(false);
        }
      }
    }

    if (state.product && state.fabric) {
      void loadPrice();
    } else {
      setPrice(null);
    }

    return () => {
      cancelled = true;
    };
  }, [pricingPlacements, qty, state.fabric, state.product]);

  useEffect(() => {
    if (status !== "authenticated" || !showAuthModal) return;

    setShowAuthModal(false);
    setAuthPassword("");
    if (checkoutAfterAuth) {
      setCheckoutAfterAuth(false);
      setCustomerEmail(session?.user?.email ?? authEmail);
      setShowCheckout(true);
    } else {
      setShowBespokeModal(true);
    }
  }, [authEmail, checkoutAfterAuth, session?.user?.email, showAuthModal, status]);

  useEffect(() => {
    setCheckoutOrderId(null);
  }, [pricingPlacements, qty, state.color, state.fabric, state.product]);

  function save(next: DraftDTO) {
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
    setGeneratedMockupUrl(null);
    setMockupError(null);

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
    setGeneratedMockupUrl(null);
    setMockupError(null);

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
    setGeneratedMockupUrl(null);
    setMockupError(null);
    save({ ...state, primaryAssetId: null });
  }

  function updateArtworkTransform(next: ArtworkTransform) {
    setArtworkTransform({
      x: Math.round(next.x),
      y: Math.round(next.y),
      scale: clampArtworkScale(next.scale),
    });
    setGeneratedMockupUrl(null);
    setMockupError(null);
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
    if (!artworkUrl || generatedMockupUrl) return;
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

    updateArtworkTransform({
      ...dragState.origin,
      x: dragState.origin.x + event.clientX - dragState.startX,
      y: dragState.origin.y + event.clientY - dragState.startY,
    });
  }

  function handleArtworkPointerUp(event: ReactPointerEvent<HTMLImageElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
  }

async function generateNanoBananaMockup() {
  if (!state.primaryAssetId || !activeArtworkAsset) {
    setMockupError("Select artwork first.");
    return;
  }

  setMockupPending(true);
  setMockupError(null);

  try {
    const response = await fetch("/api/mockups/nanobanana", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buildId,
        assetId: state.primaryAssetId,
        product: state.product,
        color: state.color,
        placement: activePlacement,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error ?? "Could not generate mockup.");
    }

    // ✅ التغيير هنا فقط: fallback آمن
    setGeneratedMockupUrl(data.imageUrl || activeArtworkAsset.url);

  } catch (error) {
    setGeneratedMockupUrl(activeArtworkAsset?.url ?? null); // fallback آمن
    setMockupError(
      error instanceof Error ? error.message : "Could not generate mockup."
    );
  } finally {
    setMockupPending(false);
  }
}

  function openCheckout() {
    if (!price || price.mode !== "standard") {
      alert("Pricing not ready");
      return;
    }

    if (!state.product || !state.fabric || !state.color) {
      alert("Please complete selection");
      return;
    }

    if (status !== "authenticated") {
      setShowAuthModal(true);
      return;
    }

    // ✅ بدل popup القديم → redirect مباشر
    router.push(`/checkout?buildId=${buildId}`);
  }

async function handleCheckoutSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!price || price.mode !== "standard" || !state.product || !state.fabric || !state.color) return;

  setIsCreatingOrder(true);
  setCheckoutError(null);

  try {
    const paymobRes = await fetch("/api/payments/paymob/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(checkoutOrderId
          ? { orderId: checkoutOrderId }
          : { buildId, customer: { name: customerName, email: customerEmail, phone: customerPhone } }),
        method: paymentMethod,
        size: selectedSize,
        placements:
          selectedPlacements.length > 0
            ? selectedPlacements
            : ["CENTER_FRONT"],
      }),
    });
    const paymobData = await paymobRes.json();

    if (!paymobRes.ok || !paymobData?.paymentUrl) {
      if (typeof paymobData?.orderId === "string") setCheckoutOrderId(paymobData.orderId);
      throw new Error(paymobData?.error || "Payment initialization failed");
    }
    window.location.replace(paymobData.paymentUrl);
  } catch (error) {
    console.error(error);
    setCheckoutError(error instanceof Error ? error.message : "Something went wrong");
  } finally {
    setIsCreatingOrder(false);
  }
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
      setShowBespokeModal(true);
      router.refresh();
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

  const priceText = loadingPrice
    ? "Calculating..."
    : state.product === "CUSTOM"
      ? "Custom garments require a tailored quote."
      : price?.mode === "standard"
        ? `${price.currency} ${price.total.toFixed(2)}`
        : price?.message ?? "Pricing unavailable";

  const selectionSummary = [
    state.product === "FITTED"
      ? "FITTED"
      : state.product === "OVERSIZED"
        ? "OVERSIZED"
        : "BESPOKE",
    state.color === "BLACK" ? "BLACK" : "WHITE",
    currentFabric.gsm.replace(" Cotton", ""),
  ].join(" / ");


  const isStandardCheckout =
    Boolean(state.product && state.color && state.fabric) &&
    price?.mode === "standard" &&
    state.product !== "CUSTOM";

  // إحداثيات مصممة خصيصاً لتتناسب مع صورة front-tshirt.png المفرغة اللي في المودال
  const bespokeArtworkStyle = useMemo(() => {
    if (!activePlacement) return {};
    const styles: Record<PlacementKey, CSSProperties> = {
      CENTER_FRONT: { top: "35%", left: "50%", transform: "translateX(-50%)", width: "24%", height: "auto" },
      FULL_FRONT: { top: "28%", left: "50%", transform: "translateX(-50%)", width: "36%", height: "auto" },
      LEFT_CHEST: { top: "32%", left: "62%", transform: "translateX(-50%)", width: "10%", height: "auto" }, 
      RIGHT_CHEST: { top: "32%", left: "38%", transform: "translateX(-50%)", width: "10%", height: "auto" },
      CENTER_BACK: { top: "35%", left: "50%", transform: "translateX(-50%)", width: "24%", height: "auto" },
      FULL_BACK: { top: "28%", left: "50%", transform: "translateX(-50%)", width: "36%", height: "auto" },
      LEFT_SLEEVE: { top: "42%", left: "84%", transform: "translateX(-50%)", width: "10%", height: "auto" },
      RIGHT_SLEEVE: { top: "42%", left: "16%", transform: "translateX(-50%)", width: "10%", height: "auto" },
    };
    return styles[activePlacement];
  }, [activePlacement]);

  const bespokeShirtSrc = useMemo(
    () => getBespokeShirtImage(state.product, state.color, activePlacement),
    [activePlacement, state.color, state.product],
  );
  const bespokeArtworkTransform = useMemo(() => {
    const baseTransform =
      typeof bespokeArtworkStyle.transform === "string" ? bespokeArtworkStyle.transform : "";
    return `${baseTransform} translate(${artworkTransform.x}px, ${artworkTransform.y}px) scale(${artworkTransform.scale})`.trim();
  }, [artworkTransform, bespokeArtworkStyle]);

  const authPopup =
    mounted && showAuthModal
      ? createPortal(
          <div className="studio-modal-overlay">
            <div className="studio-auth-modal studio-modal-panel">
              <button
                type="button"
                onClick={() => { setShowAuthModal(false); setCheckoutAfterAuth(false); }}
                className="studio-modal-close"
                aria-label="Close login or signup"
              >
                ×
              </button>

              <div className="studio-modal-kicker">TGFM Account</div>
              <h2 className="studio-auth-title">Login Or Sign Up</h2>
              <p className="studio-auth-copy">
                Continue to save your artwork and build your T-shirt.
              </p>

              <div className="studio-auth-tabs" role="tablist" aria-label="Account mode">
                <button
                  type="button"
                  onClick={() => switchAuthMode("login")}
                  className={cn(
                    "studio-auth-tab",
                    authMode === "login" ? "studio-auth-tab-active" : "",
                  )}
                  aria-pressed={authMode === "login"}
                >
                  Login
                </button>

                <button
                  type="button"
                  onClick={() => switchAuthMode("signup")}
                  className={cn(
                    "studio-auth-tab",
                    authMode === "signup" ? "studio-auth-tab-active" : "",
                  )}
                  aria-pressed={authMode === "signup"}
                >
                  Sign Up
                </button>
              </div>

              <form className="studio-auth-form" onSubmit={handleAuthSubmit}>
                <label className="studio-auth-field">
                  <span className="studio-auth-label">Email</span>
                  <input
                    className="studio-auth-input"
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="you@email.com"
                    required
                  />
                </label>

                <label className="studio-auth-field">
                  <span className="studio-auth-label">Password</span>
                  <input
                    className="studio-auth-input"
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                    minLength={authMode === "signup" ? 8 : undefined}
                    placeholder={authMode === "signup" ? "min 8 chars" : "password"}
                    required
                  />
                </label>

                {authMode === "signup" ? (
                  <div className="studio-auth-hint">
                    Password must be at least 8 characters.
                  </div>
                ) : null}

                {authError ? <div className="studio-auth-error">{authError}</div> : null}

                <button
                  type="submit"
                  className="studio-auth-submit"
                  disabled={authPending || status === "loading"}
                >
                  {authPending
                    ? authMode === "signup"
                      ? "Creating..."
                      : "Logging in..."
                    : authMode === "signup"
                      ? "Create Account"
                      : "Login"}
                </button>
              </form>

              <div className="studio-auth-footer">
                {authMode === "login" ? "New here?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => switchAuthMode(authMode === "login" ? "signup" : "login")}
                  className="studio-auth-inline-button"
                >
                  {authMode === "login" ? "Create account" : "Login"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const checkoutPopup =
    mounted && showCheckout
      ? createPortal(
          <div className="studio-modal-overlay">
            <div className="relative w-[min(92vw,540px)] rounded-[28px] bg-white p-6 text-black shadow-2xl sm:p-8">
              <button
                type="button"
                onClick={() => !isCreatingOrder && setShowCheckout(false)}
                className="absolute right-5 top-4 text-3xl leading-none text-black/40 hover:text-black"
                aria-label="Close checkout"
              >
                ×
              </button>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">Secure checkout</p>
              <h2 className="mt-2 text-3xl font-semibold">Complete your order</h2>
              <p className="mt-2 text-sm leading-6 text-black/55">
                Your final total is calculated on our server. Card details are entered securely on Paymob.
              </p>

              <form onSubmit={handleCheckoutSubmit} className="mt-6 space-y-4">
                <label className="block text-sm font-medium">
                  Full name
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    autoComplete="name"
                    required
                    minLength={2}
                    className="mt-2 h-12 w-full rounded-xl border border-black/15 px-4 outline-none focus:border-black"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Email
                    <input
                      value={customerEmail}
                      onChange={(event) => setCustomerEmail(event.target.value)}
                      type="email"
                      autoComplete="email"
                      required
                      className="mt-2 h-12 w-full rounded-xl border border-black/15 px-4 outline-none focus:border-black"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Phone
                    <input
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      type="tel"
                      autoComplete="tel"
                      placeholder="+20 10 0000 0000"
                      required
                      className="mt-2 h-12 w-full rounded-xl border border-black/15 px-4 outline-none focus:border-black"
                    />
                  </label>
                </div>

                <fieldset>
                  <legend className="text-sm font-medium">Payment method</legend>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-4", paymentMethod === "CARD" ? "border-black bg-black text-white" : "border-black/15")}>
                      <input type="radio" name="paymentMethod" value="CARD" checked={paymentMethod === "CARD"} onChange={() => setPaymentMethod("CARD")} />
                      <span className="font-semibold">Credit / debit card</span>
                    </label>
                    {walletEnabled ? (
                      <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-4", paymentMethod === "WALLET" ? "border-black bg-black text-white" : "border-black/15")}>
                        <input type="radio" name="paymentMethod" value="WALLET" checked={paymentMethod === "WALLET"} onChange={() => setPaymentMethod("WALLET")} />
                        <span className="font-semibold">Mobile wallet</span>
                      </label>
                    ) : null}
                  </div>
                </fieldset>

                <div className="flex items-center justify-between rounded-xl bg-[#f5f3ef] p-4">
                  <span className="text-sm text-black/55">Estimated total</span>
                  <strong className="text-lg">{price?.mode === "standard" ? `${price.currency} ${price.total.toFixed(2)}` : "—"}</strong>
                </div>
                {checkoutError ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{checkoutError}</div> : null}
                <button
                  type="submit"
                  disabled={isCreatingOrder}
                  className="h-13 w-full rounded-xl bg-black px-5 py-3.5 font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                >
                  {isCreatingOrder ? "Connecting to Paymob…" : "Continue to secure payment"}
                </button>
              </form>
            </div>
          </div>,
          document.body,
        )
      : null;

  const customPopup =
    mounted && showCustomPopup
      ? createPortal(
          <div className="studio-modal-overlay">
            <div className="studio-custom-request-modal studio-modal-panel">
              <button
                type="button"
                onClick={() => setShowCustomPopup(false)}
                className="studio-modal-close"
                aria-label="Close custom garment request"
              >
                ×
              </button>

              <div className="studio-modal-kicker">TGFM Bespoke</div>

              <h2 className="studio-custom-request-title">Custom Garment Request</h2>

              <p className="studio-custom-request-copy">
                Custom garment constructions are not available for instant checkout.
                We&apos;ll review your request and provide a tailored quote based on
                your customization needs.
              </p>

              <button
                type="button"
                onClick={continueCustomRequest}
                className="studio-modal-primary-button"
              >
                Continue With Custom Request
              </button>

              <button
                type="button"
                onClick={() => setShowCustomPopup(false)}
                className="studio-modal-secondary-button"
              >
                Go Back
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  const bespokeModal =
    mounted && showBespokeModal
      ? createPortal(
          <div className="studio-modal-overlay studio-modal-overlay-soft">
            <div className="studio-bespoke-modal studio-modal-panel">
              <button
                type="button"
                onClick={() => setShowBespokeModal(false)}
                className="studio-modal-close"
                aria-label="Close bespoke builder"
              >
                ×
              </button>

              <div className="studio-bespoke-preview">
                <div className="studio-bespoke-canvas" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                 <img
                    src={generatedMockupUrl ?? bespokeShirtSrc}
                    alt="T-shirt preview"
                    className="studio-bespoke-shirt"
                    style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain" }}
                  />

                  {artworkUrl && !generatedMockupUrl ? (
                    <img
                      src={artworkUrl!}
                      alt="Artwork preview"
                      className="studio-bespoke-artwork studio-bespoke-artwork-draggable"
                      style={{ 
                        position: "absolute", 
                        zIndex: 40, 
                        mixBlendMode: state.color === "WHITE" ? "multiply" : "normal",
                        opacity: state.color === "WHITE" ? 0.95 : 1,
                        ...bespokeArtworkStyle,
                        transform: bespokeArtworkTransform,
                      }}
                      draggable={false}
                      onPointerDown={handleArtworkPointerDown}
                      onPointerMove={handleArtworkPointerMove}
                      onPointerUp={handleArtworkPointerUp}
                      onPointerCancel={handleArtworkPointerUp}
                    />
                  ) : null}
                </div>

                <div className="studio-bespoke-placement-area">
                  <div className="studio-bespoke-label">Select Placement</div>

                  <div className="studio-placement-grid">
                    {placementCards.map((placement) => {
                      const active = selectedPlacements.includes(placement.key);
                      const isViewed = activePlacement === placement.key;

                      return (
                        <button
                          key={placement.key}
                          type="button"
                          onClick={() => {
                            togglePlacement(placement.key);
                            setActivePlacement(placement.key);
                          }}
                          className={cn(
                            "studio-placement-card",
                            active ? "studio-placement-card-active" : "",
                            isViewed ? "border-black border-2" : ""
                          )}
                          aria-label={placement.label}
                        >
                          <img
                            src={placement.image}
                            alt={placement.label}
                            className="studio-placement-image"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="studio-bespoke-controls">
                <div>
                  <div className="studio-bespoke-kicker">Custom Artwork</div>
                  <h2 className="studio-bespoke-title">Build Your T-Shirt</h2>
                </div>

                <div className="studio-selected-artwork-area">
                  <div className="studio-bespoke-label">Selected Artwork</div>

                  <div className="studio-selected-artwork-grid">
                    {activeArtworkAsset ? (
                      <div className="studio-selected-artwork-card">
                        <button
                          type="button"
                          onClick={removeSelectedArtwork}
                          className="studio-selected-artwork-remove"
                          aria-label="Remove selected artwork"
                        >
                          ×
                        </button>

                        <img
                          src={activeArtworkAsset.url}
                          alt={activeArtworkAsset.fileName}
                          className="studio-selected-artwork-image"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="studio-selected-artwork-add"
                      >
                        + Add
                      </button>
                    )}
                  </div>

                  {activeArtworkAsset ? (
                    <div className="studio-artwork-tools">
                      <div className="studio-artwork-transform-controls">
                        <button
                          type="button"
                          onClick={() => changeArtworkScale(artworkTransform.scale - 0.1)}
                          aria-label="Zoom artwork out"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min="0.4"
                          max="2.4"
                          step="0.05"
                          value={artworkTransform.scale}
                          onChange={(event) => changeArtworkScale(Number(event.target.value))}
                          aria-label="Artwork zoom"
                        />
                        <button
                          type="button"
                          onClick={() => changeArtworkScale(artworkTransform.scale + 0.1)}
                          aria-label="Zoom artwork in"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={resetArtworkTransform}
                          className="studio-artwork-reset-button"
                        >
                          Reset
                        </button>
                      </div>

                      <div className="studio-nanobanana-actions">
                        <button
                          type="button"
                          onClick={() => void generateNanoBananaMockup()}
                          disabled={mockupPending || !state.primaryAssetId}
                          className="studio-nanobanana-button"
                        >
                          {mockupPending
                            ? "Generating..."
                            : generatedMockupUrl
                              ? "Regenerate Nano Banana Mockup"
                              : "Generate Nano Banana Mockup"}
                        </button>
                        {generatedMockupUrl ? (
                          <button
                            type="button"
                            onClick={() => setGeneratedMockupUrl(null)}
                            className="studio-artwork-edit-button"
                          >
                            Edit Placement
                          </button>
                        ) : null}
                      </div>

                      {mockupError ? (
                        <div className="studio-bespoke-error">{mockupError}</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="studio-bespoke-upload-button"
                >
                  Upload Artwork
                </button>

                <div>
                  <div className="studio-bespoke-label">Your Uploads</div>

                  <div className="studio-upload-grid">
                    {userAssets.length ? (
                      userAssets.map((asset) => {
                        const isCurrentActive = state.primaryAssetId === asset.id || artworkUrl === asset.url;
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => void selectAsset(asset)}
                            className={cn(
                              "studio-upload-slot",
                              isCurrentActive ? "border-black border-[1.5px]" : ""
                            )}
                            style={{ padding: 0, overflow: "hidden" }}
                            disabled={attachingAssetId === asset.id}
                          >
                            <img
                              src={asset.url}
                              alt={asset.fileName}
                              className="studio-upload-image"
                            />
                          </button>
                        );
                      })
                    ) : (
                      <div className="studio-upload-empty">No uploads yet</div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    save({
                      ...state,
                      product: "CUSTOM" as ProductType,
                    });
                    setShowBespokeModal(false);
                  }}
                  className="studio-bespoke-save-button"
                >
                  Save T-Shirt
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {authPopup}
      {checkoutPopup}
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
                <div className="studio-control-group">
                  <div className="studio-control-heading">
                    <div>
                      <div className="studio-eyebrow">Product Type</div>
                      <div className="studio-control-caption">
                        Select the silhouette.
                      </div>
                    </div>

                    <span className="studio-step-number">01</span>
                  </div>

                  <div className="studio-product-list">
                    <button
                      type="button"
                      onClick={() =>
                        save({
                          ...state,
                          product: "FITTED" as ProductType,
                        })
                      }
                      className={cn(
                        "studio-product-button",
                        state.product === "FITTED"
                          ? "studio-product-button-active"
                          : "studio-product-button-idle",
                      )}
                    >
                      <span>Fitted T-Shirt</span>
                      <span className="studio-product-meta">Classic</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        save({
                          ...state,
                          product: "OVERSIZED" as ProductType,
                        })
                      }
                      className={cn(
                        "studio-product-button",
                        state.product === "OVERSIZED"
                          ? "studio-product-button-active"
                          : "studio-product-button-idle",
                      )}
                    >
                      <span>Oversized T-Shirt</span>
                      <span className="studio-product-meta">Relaxed</span>
                    </button>

                    <button
                      type="button"
                      onClick={openCustomRequestPopup}
                      className={cn(
                        "studio-product-button",
                        state.product === "CUSTOM"
                          ? "studio-product-button-active"
                          : "studio-product-button-idle",
                      )}
                    >
                      <span>Bespoke</span>
                      <span className="studio-product-meta">Custom</span>
                    </button>
                  </div>
                </div>

                <div className="studio-control-group">
                  <div className="studio-control-heading">
                    <div>
                      <div className="studio-eyebrow">Colour</div>
                      <div className="studio-control-caption">
                        Current: {currentColorLabel}
                      </div>
                    </div>

                    <span className="studio-step-number">02</span>
                  </div>

                  <div className="studio-colour-row">
                    <button
                      type="button"
                      aria-label="Select black"
                      onClick={() =>
                        save({
                          ...state,
                          color: "BLACK" as GarmentColor,
                        })
                      }
                      className={cn(
                        "studio-colour-dot",
                        state.color === "BLACK" ? "studio-colour-dot-active" : "",
                      )}
                    >
                      <span className="studio-colour-dot-core studio-colour-dot-core-black" />
                    </button>

                    <button
                      type="button"
                      aria-label="Select white"
                      onClick={() =>
                        save({
                          ...state,
                          color: "WHITE" as GarmentColor,
                        })
                      }
                      className={cn(
                        "studio-colour-dot studio-colour-dot-white",
                        state.color === "WHITE" ? "studio-colour-dot-active" : "",
                      )}
                    >
                      <span className="studio-colour-dot-core studio-colour-dot-core-white" />
                    </button>

                    <button
                      type="button"
                      aria-label="Request custom colour"
                      onClick={openCustomRequestPopup}
                      className="studio-colour-dot studio-colour-dot-custom"
                    >
                      <img
                        src={CUSTOM_COLOUR_ICON}
                        alt=""
                        aria-hidden="true"
                        className="studio-colour-custom-icon"
                      />
                    </button>
                  </div>
                </div>

                <div className="studio-control-group">
                  <div className="studio-control-heading">
                    <div>
                      <div className="studio-fabric-title-row">
                        <span className="studio-eyebrow mb-0">Fabric</span>
                      </div>

                      <div className="studio-control-caption">
                        Current: {currentFabric.gsm}
                      </div>
                    </div>

                    <span className="studio-step-number">03</span>
                  </div>

                  <div ref={fabricMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setFabricOpen((value) => !value)}
                      className="studio-fabric-card"
                      aria-expanded={fabricOpen}
                      aria-haspopup="listbox"
                    >
                      <span className="studio-fabric-swatch" />

                      <span className="studio-fabric-content">
                        <span className="studio-fabric-name">{currentFabric.name}</span>
                        <span className="studio-fabric-gsm">{currentFabric.gsm}</span>
                        <span className="studio-fabric-desc">{currentFabric.desc}</span>
                      </span>

                      <svg
                        className={cn(
                          "studio-fabric-arrow",
                          fabricOpen ? "rotate-180" : "",
                        )}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>

                    {fabricOpen ? (
                      <div className="studio-fabric-menu" role="listbox">
                        {fabricOptions.map((fabric) => (
                          <button
                            key={fabric.key}
                            type="button"
                            onClick={() => {
                              save({
                                ...state,
                                fabric: fabric.key,
                              });
                              setFabricOpen(false);
                            }}
                            className={cn(
                              "studio-fabric-option",
                              state.fabric === fabric.key
                                ? "studio-fabric-option-active"
                                : "",
                            )}
                          >
                            <span className="studio-fabric-swatch studio-fabric-option-swatch" />

                            <span className="studio-fabric-option-copy">
                              <span className="studio-fabric-option-name">
                                {fabric.name}
                              </span>

                              <span className="studio-fabric-option-desc">
                                {fabric.desc}
                              </span>
                            </span>

                            {state.fabric === fabric.key ? (
                              <span className="studio-fabric-check">✓</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

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
              generatedMockupUrl={generatedMockupUrl}
            />

            <section className="studio-right-panel" aria-label="Order controls">
              <div className="studio-right-sticky">
                <div className="studio-right-top">
                  <div className="studio-price-stack">
                    <div className="studio-price">{priceText}</div>
                    <div className="studio-shipping-note">
                      Incl. VAT. Ships in 3-5 business days.
                    </div>
                  </div>
                </div>

                <div className="studio-right-divider" />

                <div className="studio-field-block studio-quantity-block">
                  <div className="studio-right-label">Quantity</div>

                  <div className="studio-quantity">
                    <button
                      type="button"
                      onClick={() => save({ ...state, quantity: Math.max(1, qty - 1) })}
                      className="studio-quantity-button"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>

                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={qty}
                      onChange={(event) =>
                        save({
                          ...state,
                          quantity: clampQty(Number(event.target.value)),
                        })
                      }
                      className="studio-quantity-input"
                      aria-label="Quantity"
                    />

                    <button
                      type="button"
                      onClick={() => save({ ...state, quantity: Math.min(9999, qty + 1) })}
                      className="studio-quantity-button"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>

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
<button
  onClick={openCheckout}
  disabled={!isStandardCheckout || isCreatingOrder}
  className="
    studio-add-button
  "
>
  <span className="flex items-center justify-center gap-2">
    Checkout
    <span className="transition-transform duration-300 group-hover:translate-x-1">
      →
    </span>
  </span>

  {/* underline animation */}
  <span className="absolute bottom-0 left-0 h-[1px] w-0 bg-black transition-all duration-300 hover:w-full" />
</button>

                  <button type="button" className="studio-wishlist-button">
                    Add To Wishlist
                  </button>
                </div>

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
