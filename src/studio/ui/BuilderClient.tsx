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
import LiveMockupPreview from "src/studio/ui/LiveMockupPreview";

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

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clampQty(qty: number) {
  if (!Number.isFinite(qty)) return 1;
  return Math.max(1, Math.min(9999, Math.floor(qty)));
}

function extractHexFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/COLOR_HEX=#[0-9a-fA-F]{6}/);
  return match ? match[0].replace("COLOR_HEX=", "") : null;
}

function upsertHexInNotes(notes: string | null | undefined, hex: string) {
  const clean = (notes ?? "").trim();
  const tag = `COLOR_HEX=${hex.toUpperCase()}`;

  if (!clean) return tag;

  if (/COLOR_HEX=#[0-9a-fA-F]{6}/.test(clean)) {
    return clean.replace(/COLOR_HEX=#[0-9a-fA-F]{6}/, tag);
  }

  return `${clean}\n${tag}`;
}

export default function BuilderClient({
  buildId,
  buildName,
  draft,
  placementsCount,
}: BuilderClientProps) {
  const [isPending, startTransition] = useTransition();

  const [state, setState] = useState<DraftDTO>(draft);
  const [selectedPlacements, setSelectedPlacements] = useState<PlacementKey[]>(
    []
  );

  const [uploadName, setUploadName] = useState("");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);

  const [showCustomPopup, setShowCustomPopup] = useState(false);
  const [customRequest, setCustomRequest] = useState(state.customNotes ?? "");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const qty = useMemo(
    () => clampQty(Number(state.quantity ?? 1)),
    [state.quantity]
  );

  const customHex = extractHexFromNotes(state.customNotes) ?? "#111827";

  const [price, setPrice] = useState<PriceResult | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);

  const isValid = Boolean(
    state.product &&
      state.fabric &&
      qty > 0 &&
      selectedPlacements.length > 0 &&
      artworkUrl &&
      price?.mode === "standard"
  );

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

        if (!cancelled) setPrice(data);
      } catch {
        if (!cancelled) {
          setPrice({
            mode: "custom",
            unit: null,
            total: null,
            currency: "USD",
            message: "Pricing error",
          });
        }
      } finally {
        if (!cancelled) setLoadingPrice(false);
      }
    }

    if (state.product && state.fabric) loadPrice();
    else setPrice(null);

    return () => {
      cancelled = true;
    };
  }, [state.product, state.fabric, qty]);

  const priceText = loadingPrice
    ? "Calculating..."
    : !state.product || !state.fabric
      ? "Select product & fabric"
      : price?.mode === "standard"
        ? `$${price.total.toFixed(2)}`
        : price?.message ?? "—";

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

  function decQty() {
    save({ ...state, quantity: Math.max(1, qty - 1) });
  }

  function incQty() {
    save({ ...state, quantity: Math.min(9999, qty + 1) });
  }

  const productOptions: Array<{ key: ProductType; label: string }> = [
    { key: "FITTED" as ProductType, label: "Fitted T-shirt" },
    { key: "OVERSIZED" as ProductType, label: "Oversized T-shirt" },
    { key: "CUSTOM" as ProductType, label: "Custom" },
  ];

  const fabricOptions: Array<{
    key: FabricType;
    name: string;
    gsm: string;
    desc: string;
  }> = [
    {
      key: "ESSENTIALS_170" as FabricType,
      name: "Essentials",
      gsm: "170 GSM",
      desc: "Lightweight everyday fabric",
    },
    {
      key: "SIGNATURE_200" as FabricType,
      name: "Signature",
      gsm: "200 GSM",
      desc: "Premium balanced weight",
    },
    {
      key: "HEAVYWEIGHT_300" as FabricType,
      name: "Heavyweight",
      gsm: "300 GSM",
      desc: "Thick elevated feel",
    },
  ];

  const placementCards: Array<{
    key: PlacementKey;
    label: string;
    image: string;
  }> = [
    { key: "LEFT_CHEST", label: "Left Chest", image: "/images/placements/left-chest.png" },
    { key: "RIGHT_CHEST", label: "Right Chest", image: "/images/placements/right-chest.png" },
    { key: "RIGHT_SLEEVE", label: "Right Sleeve", image: "/images/placements/right-sleeve.png" },
    { key: "LEFT_SLEEVE", label: "Left Sleeve", image: "/images/placements/left-sleeve.png" },
    { key: "CENTER_FRONT", label: "Center Front", image: "/images/placements/center-front.png" },
    { key: "FULL_FRONT", label: "Full Front", image: "/images/placements/full-front.png" },
    { key: "CENTER_BACK", label: "Center Back", image: "/images/placements/center-back.png" },
    { key: "FULL_BACK", label: "Full Back", image: "/images/placements/full-back.png" },
  ];

  const customPopup = showCustomPopup
    ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[540px] rounded-[26px] bg-white p-6 shadow-[0_30px_100px_rgba(0,0,0,0.38)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[24px] font-semibold text-black">
                  Custom Garment Request
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Custom garments require a tailored quote. Tell us what you need.
                </p>
              </div>

              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 hover:text-black"
                onClick={() => setShowCustomPopup(false)}
              >
                ×
              </button>
            </div>

            <textarea
              value={customRequest}
              onChange={(e) => setCustomRequest(e.target.value)}
              placeholder="Example: oversized hoodie, heavyweight fabric, front and back print..."
              className="mt-5 h-[150px] w-full resize-none rounded-2xl border border-gray-300 p-4 text-sm text-black outline-none focus:border-black focus:ring-4 focus:ring-black/5"
            />

            <div className="mt-5 grid gap-3 sm:flex sm:justify-end">
              <button
                type="button"
                className="h-11 rounded-xl border border-gray-300 px-5 text-sm font-semibold text-black hover:bg-gray-50"
                onClick={() => setShowCustomPopup(false)}
              >
                Cancel
              </button>

              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-6 text-sm font-semibold text-white hover:opacity-90"
                onClick={() => {
                  save({
                    ...state,
                    product: "CUSTOM" as ProductType,
                    customNotes: customRequest,
                  });
                }}
              >
                Continue on WhatsApp
              </a>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {customPopup}

      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-0">
        <div className="mb-4 text-sm text-black/60">
          Build: <span className="font-medium text-black">{buildName}</span>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(360px,500px)_minmax(420px,600px)_280px]">
          <section className="min-w-0 rounded-[26px] bg-[linear-gradient(180deg,rgba(200,120,50,0.35)_0%,rgba(200,120,50,0.18)_35%,#120d09_75%,#0a0705_100%)] p-4 text-white sm:p-8 lg:p-10">
            <div className="text-4xl font-medium leading-none tracking-tight text-black sm:text-6xl">
              Details
            </div>

            <div className="mt-7 space-y-8">
              <section className="space-y-3">
                <div className="text-sm font-semibold text-black">Product</div>

                <div className="grid grid-cols-1 gap-2 rounded-[24px] border border-[#7a4a16] bg-black/90 p-2 shadow-[inset_0_1px_0_rgba(255,210,140,0.18),0_10px_24px_rgba(0,0,0,0.35)] sm:grid-cols-3">
                  {productOptions.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        if (p.key === "CUSTOM") {
                          save({ ...state, product: p.key });
                          setShowCustomPopup(true);
                          return;
                        }
                        save({ ...state, product: p.key });
                      }}
                      className={cn(
                        "min-h-[44px] w-full rounded-full px-4 text-sm font-medium transition-all duration-200",
                        state.product === p.key
                          ? "bg-gradient-to-r from-[#6b3a12] to-black text-white shadow-[0_6px_16px_rgba(0,0,0,0.45)]"
                          : "text-[#f3d2aa] hover:bg-white/10 hover:text-white"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-semibold text-black">Colour</div>

                <div className="grid grid-cols-1 gap-2 rounded-[24px] border border-[#7a4a16] bg-[linear-gradient(90deg,#5a3410_0%,#241304_45%,#050505_100%)] p-2 shadow-[inset_0_1px_0_rgba(255,210,140,0.18),0_10px_24px_rgba(0,0,0,0.35)] sm:grid-cols-3">
                  <button
                    type="button"
                    className={cn(
                      "min-h-[44px] w-full rounded-full border px-5 text-sm font-medium transition-all duration-200",
                      state.color === "BLACK"
                        ? "border-black bg-black text-white"
                        : "border-transparent text-[#f3d2aa] hover:bg-black hover:text-white"
                    )}
                    onClick={() =>
                      save({ ...state, color: "BLACK" as GarmentColor })
                    }
                  >
                    Black
                  </button>

                  <button
                    type="button"
                    className={cn(
                      "min-h-[44px] w-full rounded-full border px-5 text-sm font-medium transition-all duration-200",
                      state.color === "WHITE"
                        ? "border-white bg-white text-black"
                        : "border-transparent text-[#f3d2aa] hover:bg-white hover:text-black"
                    )}
                    onClick={() =>
                      save({ ...state, color: "WHITE" as GarmentColor })
                    }
                  >
                    White
                  </button>

                  <label
                    className={cn(
                      "flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-full border px-5 text-sm font-medium transition-all duration-200",
                      state.color === "CUSTOM"
                        ? "border-black bg-black text-white"
                        : "border-transparent text-[#f3d2aa] hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <input
                      type="color"
                      value={customHex}
                      className="h-5 w-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
                      onChange={(e) =>
                        save({
                          ...state,
                          color: "CUSTOM" as GarmentColor,
                          customNotes: upsertHexInNotes(
                            state.customNotes,
                            e.target.value
                          ),
                        })
                      }
                    />
                    Custom
                  </label>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-black">Fabric</span>

                  <div className="relative group cursor-pointer">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-black/40 bg-white/40 text-xs text-black">
                      i
                    </span>

                    <div className="absolute left-0 top-6 z-30 hidden w-80 rounded-2xl border border-black/10 bg-white p-4 text-[12px] leading-5 text-black shadow-2xl group-hover:block">
                      <div className="mb-3">
                        <div className="font-semibold">Essentials - 170 GSM</div>
                        <div>Lightweight, breathable, and built for everyday wear.</div>
                      </div>
                      <div className="mb-3">
                        <div className="font-semibold">Signature - 200 GSM</div>
                        <div>Smooth, buttery, structured, and designed to hold shape.</div>
                      </div>
                      <div>
                        <div className="font-semibold">Heavyweight - 300 GSM</div>
                        <div>Bold, substantial, durable, with elevated presence.</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  {fabricOptions.map((fabric) => {
                    const active = state.fabric === fabric.key;

                    return (
                      <button
                        key={fabric.key}
                        type="button"
                        onClick={() =>
                          save({ ...state, fabric: fabric.key as FabricType })
                        }
                        className={cn(
                          "flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all duration-200",
                          active
                            ? "border-[#a56a2a] bg-white text-black shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
                            : "border-white/15 bg-black/20 text-white hover:border-white/35 hover:bg-black/30"
                        )}
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {fabric.name} · {fabric.gsm}
                          </div>
                          <div
                            className={cn(
                              "mt-1 text-xs",
                              active ? "text-black/55" : "text-white/55"
                            )}
                          >
                            {fabric.desc}
                          </div>
                        </div>

                        <div
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                            active
                              ? "border-[#a56a2a] bg-[#a56a2a] text-white"
                              : "border-white/30 text-white/50"
                          )}
                        >
                          {active ? "✓" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-semibold text-black">Upload artwork</div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    handleUpload(file);
                    e.currentTarget.value = "";
                  }}
                />

                <button
                  type="button"
                  className="rounded-md border border-white/20 px-3 py-2 text-sm hover:bg-white/10"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file
                </button>

                <div className="max-w-full truncate text-xs text-white/70">
                  {uploadName ? `Selected: ${uploadName}` : "No file selected"}
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-semibold text-white">Placement</div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {placementCards.map((p) => {
                    const active = selectedPlacements.includes(p.key);

                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          const next = selectedPlacements.includes(p.key)
                            ? selectedPlacements.filter((x) => x !== p.key)
                            : selectedPlacements.length >= 4
                              ? selectedPlacements
                              : [...selectedPlacements, p.key];

                          setSelectedPlacements(next);

                          save({
                            ...state,
                            customNotes: JSON.stringify({ placement: next }),
                          });
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border p-2 text-left transition-all",
                          active
                            ? "border-white bg-white text-black shadow"
                            : "border-white/20 bg-black/20 text-white hover:bg-white/10"
                        )}
                      >
                        <img
                          src={p.image}
                          alt={p.label}
                          className="h-12 w-12 shrink-0 rounded-md bg-white object-cover"
                        />
                        <span className="text-sm font-medium">{p.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="text-xs text-white/60">
                  Max 4 placements · Saved placements:{" "}
                  <span className="font-semibold text-white">
                    {placementsCount}
                  </span>
                </div>
              </section>
            </div>

            <div className="mt-6 text-xs text-white/60">
              {isPending ? "Saving…" : "Saved"}
            </div>
          </section>

          <LiveMockupPreview
            product={state.product}
            color={state.color}
            customHex={customHex}
            artworkUrl={artworkUrl}
            selectedPlacements={selectedPlacements}
          />

          <section className="min-w-0 lg:sticky lg:top-6">
            <div className="w-full rounded-3xl border border-black/5 bg-[#faf8f6] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.08)] sm:p-5 lg:max-w-[280px]">
              <div className="rounded-2xl bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] sm:p-6">
                <div className="text-[26px] font-semibold leading-tight text-[#a56a2a]">
                  {priceText}
                </div>

                <div className="mt-5 text-sm leading-5 text-gray-700">
                  Order EST. 1 week after confirmation
                </div>

                <div className="mt-6 text-xs font-medium tracking-wide text-gray-600">
                  QUANTITY
                </div>

                <div className="mt-2 grid h-11 w-full max-w-[180px] grid-cols-[44px_1fr_44px] border border-black bg-white">
                  <button type="button" onClick={decQty} className="border-r border-black text-lg">
                    −
                  </button>

                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={qty}
                    onChange={(e) =>
                      save({ ...state, quantity: clampQty(Number(e.target.value)) })
                    }
                    className="w-full text-center text-sm font-semibold outline-none"
                  />

                  <button type="button" onClick={incQty} className="border-l border-black text-lg">
                    +
                  </button>
                </div>

                <button
                  type="button"
                  className="mt-4 h-11 w-full bg-black px-4 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!isValid}
                >
                  ADD TO BAG
                </button>

                <button
                  type="button"
                  className="mt-3 h-11 w-full border border-black bg-white px-4 text-xs font-semibold text-black"
                  disabled
                >
                  ADD TO WISHLIST
                </button>

                <div className="mt-5 text-[11px] leading-5 text-gray-600">
                  Model is 5ft 8’ and wears size XS.{" "}
                  <span className="underline">SIZE GUIDE</span>
                </div>

                <div className="mt-4 text-[11px] italic leading-5 text-gray-500">
                  Instant pricing and shipping estimate for 1-500 pieces
                </div>

                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-[12px] font-medium text-black underline"
                >
                  Live Assistance
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}