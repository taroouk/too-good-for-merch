"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type {
  BuildDraft,
  FabricType,
  GarmentColor,
  ProductType,
} from "@prisma/client";

import { actionUpdateDraft } from "src/actions/build-actions";
import { actionCreateAsset } from "src/actions/asset-actions";
import { WHATSAPP_URL } from "src/lib/whatsapp";
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

type PlacementKey =
  | "LEFT_CHEST"
  | "RIGHT_CHEST"
  | "RIGHT_SLEEVE"
  | "LEFT_SLEEVE"
  | "CENTER_FRONT"
  | "FULL_FRONT"
  | "CENTER_BACK"
  | "FULL_BACK";

type BuilderClientProps = {
  buildId: string;
  buildName: string;
  draft: DraftDTO;
  placementsCount: number;
};

type CreateOrderResponse = {
  orderId: string;
  orderNumber: string;
  totalCents: number;
  error?: string;
};

type SizeOption = "S" | "M" | "L" | "XL";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clampQty(qty: number) {
  if (!Number.isFinite(qty)) return 1;
  return Math.max(1, Math.min(9999, Math.floor(qty)));
}

export default function BuilderClient({
  buildId,
  buildName,
  draft,
  placementsCount,
}: BuilderClientProps) {
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [state, setState] = useState<DraftDTO>({
    ...draft,
    product: draft.product ?? ("FITTED" as ProductType),
    color: draft.color ?? ("WHITE" as GarmentColor),
    fabric: draft.fabric ?? ("ESSENTIALS_170" as FabricType),
    quantity: draft.quantity ?? 1,
  });

  const [selectedPlacements, setSelectedPlacements] = useState<PlacementKey[]>([]);
  const [uploadName, setUploadName] = useState("");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [showCustomPopup, setShowCustomPopup] = useState(false);
  const [showBespokeModal, setShowBespokeModal] = useState(false);
  const [selectedSize, setSelectedSize] = useState<SizeOption>("M");
  const [fabricOpen, setFabricOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [price, setPrice] = useState<PriceResult | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fabricMenuRef = useRef<HTMLDivElement | null>(null);

  const qty = useMemo(() => clampQty(Number(state.quantity ?? 1)), [state.quantity]);

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

  useEffect(() => {
    setMounted(true);
  }, []);

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
  }, [qty, state.fabric, state.product]);

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
    setUploadName(file.name);
    setArtworkUrl(URL.createObjectURL(file));

    const fd = new FormData();
    fd.set("fileName", file.name);
    fd.set("mimeType", file.type || "application/octet-stream");
    fd.set("sizeBytes", String(file.size || 0));

    startTransition(() => actionCreateAsset(buildId, fd));
  }

  async function handleAddToBag() {
    if (!price || price.mode !== "standard") return;
    if (!state.product || !state.fabric || !state.color) return;

    setIsCreatingOrder(true);

    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildId,
          product: state.product,
          fabric: state.fabric,
          color: state.color,
          quantity: qty,
          unitPrice: price.unit,
          total: price.total,
          placements: selectedPlacements.length > 0 ? selectedPlacements : ["CENTER_FRONT"],
          assetId: state.primaryAssetId,
          notes: state.customNotes,
        }),
      });

      const data = (await res.json()) as CreateOrderResponse;

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create order.");
      }

      window.location.href = `/orders/${data.orderId}`;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsCreatingOrder(false);
    }
  }

  function openCustomRequestPopup() {
    setShowCustomPopup(true);
  }

  function continueCustomRequest() {
    save({
      ...state,
      product: "CUSTOM" as ProductType,
      customNotes: state.customNotes ?? "",
    });

    setShowCustomPopup(false);
    setShowBespokeModal(true);
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
      product: "CUSTOM" as ProductType,
      customNotes: JSON.stringify({ placement: next }),
    });
  }

  const priceText = loadingPrice
    ? "Calculating..."
    : state.product === "CUSTOM"
      ? "Custom garments require a tailored quote."
      : price?.mode === "standard"
        ? `$${price.total.toFixed(2)}`
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

  const summaryItems = [
    {
      label: "Product",
      value:
        state.product === "CUSTOM"
          ? "Bespoke"
          : state.product === "OVERSIZED"
            ? "Oversized"
            : "Fitted",
    },
    { label: "Colour", value: currentColorLabel },
    { label: "Fabric", value: currentFabric.gsm },
    { label: "Size", value: selectedSize },
    { label: "Quantity", value: String(qty) },
  ];

  const isStandardCheckout =
    Boolean(state.product && state.color && state.fabric) &&
    price?.mode === "standard" &&
    state.product !== "CUSTOM";

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
                <div className="studio-bespoke-canvas">
                  <img
                    src="/images/front-tshirt.png"
                    alt="T-shirt preview"
                    className="studio-bespoke-shirt"
                  />

                  <img
                    src={artworkUrl ?? "/images/artwork-placeholder.png"}
                    alt="Artwork preview"
                    className="studio-bespoke-artwork"
                  />
                </div>

                <div className="studio-bespoke-placement-area">
                  <div className="studio-bespoke-label">Select Placement</div>

                  <div className="studio-placement-grid">
                    {placementCards.map((placement) => {
                      const active = selectedPlacements.includes(placement.key);

                      return (
                        <button
                          key={placement.key}
                          type="button"
                          onClick={() => togglePlacement(placement.key)}
                          className={cn(
                            "studio-placement-card",
                            active ? "studio-placement-card-active" : "",
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

                {selectedPlacements.length > 0 ? (
                  <div className="studio-selected-artwork-area">
                    <div className="studio-bespoke-label">Selected Artwork</div>

                    <div className="studio-selected-artwork-grid">
                      {selectedPlacements.map((placement) => (
                        <div key={placement} className="studio-selected-artwork-card">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedPlacements((prev) =>
                                prev.filter((item) => item !== placement),
                              )
                            }
                            className="studio-selected-artwork-remove"
                            aria-label={`Remove ${placement}`}
                          >
                            ×
                          </button>

                          <img
                            src={artworkUrl ?? "/images/artwork-placeholder.png"}
                            alt={placement}
                            className="studio-selected-artwork-image"
                          />
                        </div>
                      ))}

                      {selectedPlacements.length < 4 ? (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="studio-selected-artwork-add"
                        >
                          + Add
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

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
                    {[0, 1, 2, 3].map((index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="studio-upload-slot"
                      >
                        {index === 0 && uploadName ? (
                          <span className="studio-upload-name">{uploadName}</span>
                        ) : (
                          <span className="studio-upload-placeholder">▧</span>
                        )}
                      </button>
                    ))}
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
                <div className="studio-overline">Luxury Merch Builder</div>
                <h1 className="studio-title">Studio</h1>
                <p className="studio-panel-subtitle">
                  Configure your base garment, fabric, colour, and artwork flow
                  with a premium live preview.
                </p>
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
                      +
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
                  onClick={() => setShowCustomPopup(true)}
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

            <TryOn3DPreview
              product={state.product}
              color={state.color}
              artworkUrl={artworkUrl}
            />

            <section className="studio-right-panel" aria-label="Order controls">
              <div className="studio-right-sticky">
                <div className="studio-right-top">
                  <div>
                    <div className="studio-right-kicker">{buildName}</div>
                    <div className="studio-price">{priceText}</div>
                  </div>

                  <div className="studio-shipping-note">
                    Incl. VAT. Ships in 3-5 business days.
                  </div>
                </div>

                <div className="studio-right-divider" />

                <div className="studio-field-block studio-quantity-block">
                  <div>
                    <div className="studio-right-label">Quantity</div>
                  </div>

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
                      <div className="studio-control-caption">
                        Selected: {selectedSize}
                      </div>
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
                  {summaryOpen ? (
                    <dl className="studio-summary-dropdown" aria-label="Selection details">
                      {summaryItems.map((item) => (
                        <div key={item.label}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}

                      <div>
                        <dt>Total</dt>
                        <dd>
                          {price?.mode === "standard"
                            ? `$${price.total.toFixed(2)}`
                            : "Quote"}
                        </dd>
                      </div>
                    </dl>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setSummaryOpen((value) => !value)}
                    className="studio-summary-trigger"
                    aria-expanded={summaryOpen}
                    aria-label="Toggle selection summary"
                  >
                    <span className="studio-summary-value">{selectionSummary}</span>
                    <span
                      className={cn(
                        "studio-summary-arrow",
                        summaryOpen ? "studio-summary-arrow-open" : "",
                      )}
                    >
                      ⌃
                    </span>
                  </button>
                </div>

                <div className="studio-action-row">
                  <button
                    type="button"
                    onClick={handleAddToBag}
                    disabled={!isStandardCheckout || isCreatingOrder}
                    className="studio-add-button"
                  >
                    {isCreatingOrder ? "Creating..." : "Add To Bag"}
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