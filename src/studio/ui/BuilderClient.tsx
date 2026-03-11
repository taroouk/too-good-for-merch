// file: src/studio/ui/BuilderClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  BuildDraft,
  FabricType,
  GarmentColor,
  ProductType,
} from "@prisma/client";
import { actionUpdateDraft } from "src/actions/build-actions";
import { actionCreateAsset } from "src/actions/asset-actions";
import { WHATSAPP_URL } from "src/lib/whatsapp";

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

const PLACEMENTS: Array<{ key: PlacementKey; label: string }> = [
  { key: "LEFT_CHEST", label: "Left Chest" },
  { key: "RIGHT_CHEST", label: "Right Chest" },
  { key: "RIGHT_SLEEVE", label: "Right Sleeve" },
  { key: "LEFT_SLEEVE", label: "Left Sleeve" },
  { key: "CENTER_FRONT", label: "Center Front" },
  { key: "FULL_FRONT", label: "Full Front" },
  { key: "CENTER_BACK", label: "Center back" },
  { key: "FULL_BACK", label: "Full back" },
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clampQty(qty: number) {
  if (!Number.isFinite(qty)) return 1;
  return Math.max(1, Math.min(9999, Math.floor(qty)));
}

function pillDark(active: boolean) {
  return cn(
    "px-4 py-2 rounded-full border text-sm transition",
    active
      ? "bg-white text-black border-white"
      : "bg-transparent text-white border-white/30 hover:border-white/60 hover:bg-white/5"
  );
}

function extractHexFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/COLOR_HEX=#[0-9a-fA-F]{6}/);
  return m ? m[0].replace("COLOR_HEX=", "") : null;
}

function upsertHexInNotes(notes: string | null | undefined, hex: string): string {
  const clean = (notes ?? "").trim();
  const tag = `COLOR_HEX=${hex.toUpperCase()}`;
  if (!clean) return tag;
  if (/COLOR_HEX=#[0-9a-fA-F]{6}/.test(clean)) {
    return clean.replace(/COLOR_HEX=#[0-9a-fA-F]{6}/, tag);
  }
  return `${clean}\n${tag}`;
}

function ColorPaletteButton({
  active,
  initialHex,
  onOpen,
  onPick,
}: {
  active: boolean;
  initialHex: string;
  onOpen: () => void;
  onPick: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(initialHex);

  const presets = [
    "#111827",
    "#FFFFFF",
    "#000000",
    "#EF4444",
    "#F97316",
    "#EAB308",
    "#22C55E",
    "#06B6D4",
    "#3B82F6",
    "#8B5CF6",
    "#EC4899",
    "#94A3B8",
  ];

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "px-4 py-2 rounded-full border text-sm transition flex items-center gap-2",
          active
            ? "bg-white text-black border-white"
            : "bg-transparent text-white border-white/30 hover:border-white/60 hover:bg-white/5"
        )}
        onClick={() => {
          onOpen();
          setOpen((v) => !v);
        }}
      >
        <span
          className="inline-block h-4 w-4 rounded-full border border-white/40"
          style={{ background: hex }}
        />
        Custom
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-[260px] max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-black p-3 shadow-lg">
          <div className="text-xs text-white/70 mb-2">Pick a custom colour</div>

          <div className="grid grid-cols-6 gap-2">
            {presets.map((c) => (
              <button
                key={c}
                type="button"
                className={cn(
                  "h-7 w-7 rounded-full border border-white/25",
                  c.toLowerCase() === hex.toLowerCase()
                    ? "ring-2 ring-white"
                    : ""
                )}
                style={{ background: c }}
                onClick={() => {
                  setHex(c);
                  onPick(c);
                  setOpen(false);
                }}
                aria-label={`Pick ${c}`}
                title={c}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              className="flex-1 min-w-0 border border-white/20 bg-black/40 rounded-md p-2 text-xs text-white"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              placeholder="#RRGGBB"
            />
            <button
              type="button"
              className="border border-white/20 rounded-md px-3 py-2 text-xs text-white hover:bg-white/10"
              onClick={() => {
                const v = hex.trim();
                if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
                onPick(v);
                setOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuilderClient({
  buildId,
  buildName,
  draft,
  placementsCount,
}: {
  buildId: string;
  buildName: string;
  draft: DraftDTO;
  placementsCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<DraftDTO>(draft);

  const [placementPick, setPlacementPick] =
    useState<PlacementKey>("LEFT_CHEST");
  const [selectedPlacements, setSelectedPlacements] = useState<PlacementKey[]>(
    []
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadName, setUploadName] = useState<string>("");

  const qty = useMemo(
    () => clampQty(Number(state.quantity ?? 1)),
    [state.quantity]
  );
  const isCustomProduct = state.product === "CUSTOM";
  const customHex = extractHexFromNotes(state.customNotes) ?? "#111827";

  const priceText = "5,250 EGP";

  // ✅ lock page scroll while Builder is mounted
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

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

  async function handleUploadFile(file: File) {
    setUploadName(file.name);

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

  function addPlacement() {
    setSelectedPlacements((prev) => {
      if (prev.includes(placementPick)) return prev;
      if (prev.length >= 4) return prev;
      return [...prev, placementPick];
    });
  }

  function removePlacement(key: PlacementKey) {
    setSelectedPlacements((prev) => prev.filter((p) => p !== key));
  }

  return (
    // ✅ This container takes full screen height (minus navbar handled by layout padding),
    // and prevents page scroll. Scroll happens inside panels.
    <div className="w-full min-w-0 h-[calc(100dvh-140px)] sm:h-[calc(100dvh-160px)] overflow-hidden">
      <div className="h-full min-h-0 grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)_minmax(0,320px)]">
        {/* LEFT: DETAILS (scroll inside) */}
        <section className="order-1 rounded-sm bg-black text-white overflow-hidden">
          <div className="h-full min-h-0 flex flex-col">
            <div className="p-6 sm:p-8">
              <div className="text-5xl sm:text-6xl font-medium tracking-tight leading-none">
                Details
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-6 pb-6 sm:px-8 sm:pb-8">
              <div className="space-y-8">
                {/* Product */}
                <section className="space-y-3">
                  <div className="text-sm font-semibold">Product</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={pillDark(state.product === "FITTED")}
                      onClick={() =>
                        save({ ...state, product: "FITTED" as ProductType })
                      }
                    >
                      Fitted T-shirt
                    </button>
                    <button
                      type="button"
                      className={pillDark(state.product === "OVERSIZED")}
                      onClick={() =>
                        save({ ...state, product: "OVERSIZED" as ProductType })
                      }
                    >
                      Oversized T-shirt
                    </button>
                    <button
                      type="button"
                      className={pillDark(state.product === "CUSTOM")}
                      onClick={() =>
                        save({ ...state, product: "CUSTOM" as ProductType })
                      }
                    >
                      Custom
                    </button>
                  </div>

                  {isCustomProduct && (
                    <div className="border border-white/15 rounded-lg p-3 bg-white/5 space-y-2 text-sm">
                      <div className="font-semibold">Custom Garment Request</div>
                      <div className="text-white/70">
                        Custom garment constructions are not available for instant
                        checkout. We’ll review your request and provide a tailored quote.
                      </div>

                      <textarea
                        className="w-full border border-white/15 bg-black/40 rounded-md p-2 text-white placeholder:text-white/40"
                        value={state.customNotes ?? ""}
                        onChange={(e) =>
                          save({ ...state, customNotes: e.target.value })
                        }
                        placeholder="Describe what you need..."
                        rows={4}
                      />

                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          className="border border-white/20 rounded-md px-3 py-2 text-sm hover:bg-white/10"
                          href={WHATSAPP_URL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Continue on WhatsApp
                        </a>
                        <button
                          type="button"
                          className="border border-white/20 rounded-md px-3 py-2 text-sm hover:bg-white/10"
                          onClick={() =>
                            save({ ...state, product: "FITTED" as ProductType })
                          }
                        >
                          Go Back
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* Colour */}
                <section className="space-y-3">
                  <div className="text-sm font-semibold">Colour</div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      className={pillDark(state.color === "BLACK")}
                      onClick={() =>
                        save({ ...state, color: "BLACK" as GarmentColor })
                      }
                    >
                      Black
                    </button>

                    <button
                      type="button"
                      className={pillDark(state.color === "WHITE")}
                      onClick={() =>
                        save({ ...state, color: "WHITE" as GarmentColor })
                      }
                    >
                      White
                    </button>

                    <ColorPaletteButton
                      active={state.color === "CUSTOM"}
                      initialHex={customHex}
                      onOpen={() =>
                        save({ ...state, color: "CUSTOM" as GarmentColor })
                      }
                      onPick={(hex) => {
                        const nextNotes = upsertHexInNotes(state.customNotes, hex);
                        save({
                          ...state,
                          color: "CUSTOM" as GarmentColor,
                          customNotes: nextNotes,
                        });
                      }}
                    />
                  </div>
                </section>

                {/* Fabric */}
                <section className="space-y-3">
                  <div className="text-sm font-semibold">Fabric</div>
                  <select
                    className="w-full border border-white/20 bg-black/30 rounded-md p-2 text-sm text-white"
                    value={state.fabric ?? ""}
                    onChange={(e) =>
                      save({
                        ...state,
                        fabric: (e.target.value || null) as FabricType | null,
                      })
                    }
                  >
                    <option value="">Select fabric…</option>
                    <option value="ESSENTIALS_170">Essentials · 170 GSM</option>
                    <option value="SIGNATURE_200">Signature · 200 GSM</option>
                    <option value="HEAVYWEIGHT_300">Heavyweight · 300 GSM</option>
                  </select>
                </section>

                {/* Upload artwork */}
                <section className="space-y-3">
                  <div className="text-sm font-semibold">Upload artwork</div>

                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        handleUploadFile(f);
                        e.currentTarget.value = "";
                      }}
                    />

                    <button
                      type="button"
                      className="border border-white/20 rounded-md px-3 py-2 text-sm hover:bg-white/10 shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose file
                    </button>

                    <div className="text-xs text-white/70 truncate min-w-0">
                      {uploadName ? `Selected: ${uploadName}` : "No file selected"}
                    </div>
                  </div>

                  <div className="text-xs text-white/50">
                    Phase 4: creates an Asset record only (storage comes in Phase 5).
                  </div>
                </section>

                {/* Placement */}
                <section className="space-y-3">
                  <div className="text-sm font-semibold">Placement</div>

                  <div className="flex gap-2 min-w-0">
                    <select
                      className="flex-1 min-w-0 border border-white/20 bg-black/30 rounded-md p-2 text-sm text-white"
                      value={placementPick}
                      onChange={(e) => setPlacementPick(e.target.value as PlacementKey)}
                      disabled={selectedPlacements.length >= 4}
                    >
                      {PLACEMENTS.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={addPlacement}
                      disabled={selectedPlacements.length >= 4}
                      className={cn(
                        "border border-white/20 rounded-md px-3 text-sm shrink-0",
                        selectedPlacements.length >= 4
                          ? "text-white/40"
                          : "hover:bg-white/10"
                      )}
                    >
                      Add
                    </button>
                  </div>

                  {selectedPlacements.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedPlacements.map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs bg-white/5"
                        >
                          {PLACEMENTS.find((p) => p.key === k)?.label ?? k}
                          <button
                            type="button"
                            className="text-white/70 hover:text-white"
                            onClick={() => removePlacement(k)}
                            aria-label="Remove"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-white/60">
                    Saved placements (Designs tab):{" "}
                    <span className="text-white font-semibold">{placementsCount}</span>
                  </div>
                </section>

                <div className="text-xs text-white/60">
                  {isPending ? "Saving…" : "Saved"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CENTER: PREVIEW (always visible, no scroll) */}
        <section className="order-2 min-w-0 flex items-center justify-center overflow-hidden">
          <div className="w-full min-w-0">
            <div className="mx-auto w-full max-w-[640px]">
              <div className="aspect-[3/4] w-full border-[6px] border-black bg-white flex items-center justify-center">
                <div className="text-5xl sm:text-6xl font-medium tracking-tight">
                  preview
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT: PRICE/QUANTITY (scroll inside) */}
        <section className="order-3 min-w-0 overflow-hidden">
          <div className="h-full min-h-0 flex flex-col">
            <div className="min-h-0 flex-1 overflow-auto pt-8 sm:pt-10 space-y-4 px-1">
              <div className="text-lg font-semibold">{priceText}</div>
              <div className="text-sm text-gray-700">
                Order EST. 1 week after confirmation
              </div>

              <div className="text-xs tracking-wide text-gray-600">QUANTITY</div>
              <div className="grid grid-cols-[44px_1fr_44px] border h-10 bg-white">
                <button type="button" onClick={decQty} className="border-r hover:bg-gray-50">
                  −
                </button>
                <div className="flex items-center justify-center text-sm font-medium">
                  {qty}
                </div>
                <button type="button" onClick={incQty} className="border-l hover:bg-gray-50">
                  +
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  className="h-11 bg-black text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  disabled
                  title="Phase 5"
                >
                  ADD TO BAG
                </button>

                <button
                  type="button"
                  className="h-11 border text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                  disabled
                >
                  ADD TO WISHLIST
                </button>
              </div>

              <div className="text-xs text-gray-600">
                Model is 5ft 8’ and wears size XS.{" "}
                <span className="underline">SIZE GUIDE</span>
              </div>

              <div className="text-xs text-gray-500 italic">
                Instant pricing and shipping estimate for 1-500 pieces
              </div>
            </div>

            <div className="pb-2 text-sm underline text-right">
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                Live Assistance
              </a>
            </div>
          </div>
        </section>
      </div>

      {/* Optional tiny meta on mobile (doesn't change UI layout) */}
      <div className="mt-2 text-[11px] text-gray-400 lg:hidden">
        Project: <span className="font-medium">{buildName}</span>
      </div>
    </div>
  );
}