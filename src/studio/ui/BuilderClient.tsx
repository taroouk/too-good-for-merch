// src/studio/ui/BuilderClient.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import type { BuildDraft, FabricType, GarmentColor, ProductType } from "@prisma/client";
import { actionUpdateDraft } from "src/actions/build-actions";
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

function pill(active: boolean) {
  return cn(
    "px-4 py-2 rounded-full border text-sm transition",
    active ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
  );
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
}: {
  buildId: string;
  buildName: string;
  draft: DraftDTO;
  placementsCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<DraftDTO>(draft);

  // Phase 4 UI placement selection (max 4)
  const [placementPick, setPlacementPick] = useState<PlacementKey>("LEFT_CHEST");
  const [selectedPlacements, setSelectedPlacements] = useState<PlacementKey[]>([]);

  const qty = useMemo(() => clampQty(Number(state.quantity ?? 1)), [state.quantity]);
  const isCustom = state.product === "CUSTOM";

  // Phase 4: pricing pending. Put Figma number as placeholder.
  const priceText = "5,250 EGP";

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
    <div className="w-full">
      {/* Desktop: 3 cols | Mobile: stack */}
      <div className="grid gap-4 lg:gap-6 lg:grid-cols-[380px_1fr_320px]">
        {/* LEFT: DETAILS */}
        <section className="bg-gray-200 p-6 sm:p-8 min-h-[520px]">
          <div className="text-5xl sm:text-6xl font-medium tracking-tight leading-none">Details</div>

          <div className="mt-7 space-y-8">
            {/* 1 Product */}
            <section className="space-y-3">
              <div className="text-sm font-semibold">1/ Product: (pill buttons)</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={pill(state.product === "FITTED")}
                  onClick={() => save({ ...state, product: "FITTED" as ProductType })}
                >
                  Fitted T-shirt
                </button>
                <button
                  type="button"
                  className={pill(state.product === "OVERSIZED")}
                  onClick={() => save({ ...state, product: "OVERSIZED" as ProductType })}
                >
                  Oversized T-shirt
                </button>
                <button
                  type="button"
                  className={pill(state.product === "CUSTOM")}
                  onClick={() => save({ ...state, product: "CUSTOM" as ProductType })}
                >
                  Custom
                </button>
              </div>

              {/* Custom popup */}
              {isCustom && (
                <div className="border rounded-lg p-3 bg-white/70 space-y-2 text-sm">
                  <div className="font-semibold">Custom Garment Request</div>

                  <div className="text-gray-700">
                    <div className="font-medium">Body copy:</div>
                    <div>
                      Custom garment constructions are not available for instant checkout.
                      <br />
                      We’ll review your request and provide a tailored quote.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="font-medium">Notes</div>
                    <textarea
                      className="w-full border rounded-md p-2"
                      value={state.customNotes ?? ""}
                      onChange={(e) => save({ ...state, customNotes: e.target.value })}
                      placeholder="Describe what you need..."
                      rows={4}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      className="border rounded-md px-3 py-2 text-sm hover:bg-gray-50"
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Continue with Custom Request (redirect them to WhatsApp)
                    </a>
                    <button
                      type="button"
                      className="border rounded-md px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => save({ ...state, product: "FITTED" as ProductType })}
                    >
                      Go Back
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* 2 Colour */}
            <section className="space-y-3">
              <div className="text-sm font-semibold">2/ Colour: (pill buttons)</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={pill(state.color === "BLACK")}
                  onClick={() => save({ ...state, color: "BLACK" as GarmentColor })}
                >
                  Black
                </button>
                <button
                  type="button"
                  className={pill(state.color === "WHITE")}
                  onClick={() => save({ ...state, color: "WHITE" as GarmentColor })}
                >
                  White
                </button>
                <button
                  type="button"
                  className={pill(state.color === "CUSTOM")}
                  onClick={() => save({ ...state, color: "CUSTOM" as GarmentColor })}
                >
                  Custom
                </button>
              </div>
            </section>

            {/* 3 Fabric */}
            <section className="space-y-3">
              <div className="text-sm font-semibold">3/ Fabric: (drop-down menu with images)</div>

              <select
                className="w-full border rounded-md p-2 text-sm bg-white"
                value={state.fabric ?? ""}
                onChange={(e) => save({ ...state, fabric: (e.target.value || null) as FabricType | null })}
              >
                <option value="">Select fabric…</option>
                <option value="ESSENTIALS_170">Essentials · 170 GSM</option>
                <option value="SIGNATURE_200">Signature · 200 GSM</option>
                <option value="HEAVYWEIGHT_300">Heavyweight · 300 GSM</option>
              </select>

              <div className="text-xs text-gray-700 leading-relaxed">
                <div>Essentials · 170 GSM</div>
                <div className="text-gray-600">
                  Lightweight, breathable, and built for everyday wear. Soft-touch finish with natural airflow for all-day comfort.
                </div>
                <div className="mt-2">Signature · 200 GSM</div>
                <div className="text-gray-600">
                  Our balanced premium weight. Smooth, buttery, structured, and designed to hold its shape.
                </div>
                <div className="mt-2">The Heavyweight · 300 GSM</div>
                <div className="text-gray-600">
                  Bold, substantial, and architectural. A durable, high-impact fabric with a clean drape and elevated presence.
                </div>
              </div>
            </section>

            {/* 4 Upload artwork */}
            <section className="space-y-2">
              <div className="text-sm font-semibold">4/ Upload artwork (Upload icon)</div>
              <div className="text-sm text-gray-700">
                Request artwork{" "}
                <a className="underline" href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                  hyperlink to WhatsApp
                </a>
              </div>
            </section>

            {/* 5 Placement */}
            <section className="space-y-3">
              <div className="text-sm font-semibold">5/ Placement: (drop-down menu with images)</div>

              <div className="flex gap-2">
                <select
                  className="flex-1 border rounded-md p-2 text-sm bg-white"
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
                    "border rounded-md px-3 text-sm bg-white",
                    selectedPlacements.length >= 4 ? "text-gray-400" : "hover:bg-gray-50"
                  )}
                >
                  Add
                </button>
              </div>

              {/* UI chips */}
              {selectedPlacements.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedPlacements.map((k) => (
                    <span key={k} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs bg-white">
                      {PLACEMENTS.find((p) => p.key === k)?.label ?? k}
                      <button
                        type="button"
                        className="text-gray-500 hover:text-black"
                        onClick={() => removePlacement(k)}
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="text-xs text-gray-600">
                please add any images for now
                <br />
                (Phase 4) Saved placements (Designs tab): <span className="font-semibold">{placementsCount}</span>
              </div>
            </section>
          </div>

          <div className="mt-6 text-xs text-gray-600">{isPending ? "Saving…" : "Saved"}</div>
        </section>

        {/* CENTER: PREVIEW PLACEHOLDER */}
        <section className="flex items-center justify-center">
          <div className="w-full max-w-[620px] border-[6px] border-black bg-white h-[420px] sm:h-[560px] lg:h-[720px] flex items-center justify-center">
            <div className="text-5xl sm:text-6xl font-medium tracking-tight">preview</div>
          </div>
        </section>

        {/* RIGHT: PRICE/QUANTITY */}
        <section className="flex flex-col justify-between bg-white">
          <div className="pt-10 space-y-4">
            <div className="text-lg font-semibold">{priceText}</div>

            <div className="text-sm text-gray-700">Order EST. 1 week after confirmation</div>

            <div className="text-xs tracking-wide text-gray-600">QUANTITY</div>

            <div className="grid grid-cols-[44px_1fr_44px] border h-10 bg-white">
              <button type="button" onClick={decQty} className="border-r hover:bg-gray-50">
                −
              </button>
              <div className="flex items-center justify-center text-sm font-medium">{qty}</div>
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

              <button type="button" className="h-11 border text-sm font-medium hover:bg-gray-50" disabled>
                ADD TO WISHLIST
              </button>
            </div>

            <div className="text-xs text-gray-600">
              Model is 5ft 8’ and wears size XS. <span className="underline">SIZE GUIDE</span>
            </div>

            <div className="text-xs text-gray-500 italic">
              Instant pricing and shipping estimate for 1-500 pieces
            </div>

            {/* Bulk note */}
            {qty >= 501 && (
              <div className="text-xs text-gray-700">
                Bulk mode (501+): please request a quote on WhatsApp.
                <div className="mt-2">
                  <a className="underline" href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                    Request quote on WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="pb-8 text-sm underline text-right">
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
              Live Assistance
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}