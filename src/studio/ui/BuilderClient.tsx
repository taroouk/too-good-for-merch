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
  { key: "CENTER_BACK", label: "Center Back" },
  { key: "FULL_BACK", label: "Full Back" },
];

const PL_LABEL = new Map<PlacementKey, string>(PLACEMENTS.map((p) => [p.key, p.label]));

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function pill(active: boolean) {
  return cn(
    "px-4 py-2 rounded-full border text-sm transition",
    active ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
  );
}

function Chip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs bg-white">
      {text}
      <button type="button" className="text-gray-500 hover:text-black" onClick={onRemove} aria-label="Remove">
        ×
      </button>
    </span>
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

  const [placementPick, setPlacementPick] = useState<PlacementKey>("LEFT_CHEST");
  const [selectedPlacements, setSelectedPlacements] = useState<PlacementKey[]>([]);

  const qty = useMemo(() => {
    const q = Number(state.quantity ?? 1);
    if (!Number.isFinite(q)) return 1;
    return Math.max(1, Math.min(9999, Math.floor(q)));
  }, [state.quantity]);

  const isBulk = qty >= 501;

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

  function decQty() {
    save({ ...state, quantity: Math.max(1, qty - 1) });
  }
  function incQty() {
    save({ ...state, quantity: Math.min(9999, qty + 1) });
  }

  return (
    <div className="w-full">
      <div className="grid gap-4 lg:gap-6 lg:grid-cols-[360px_1fr_300px] lg:h-[calc(100vh-150px)]">
        {/* Details */}
        <section className="bg-gray-200 p-5 sm:p-8 lg:p-8 lg:h-full lg:overflow-hidden rounded-sm">
          <div className="text-4xl sm:text-6xl font-medium tracking-tight leading-none">Details</div>

          <div className="mt-6 sm:mt-8 space-y-6 sm:space-y-7">
            <div className="space-y-3">
              <div className="text-sm font-semibold">1) Product</div>
              <div className="flex flex-wrap gap-2">
                {(["FITTED", "OVERSIZED", "CUSTOM"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={pill(state.product === v)}
                    onClick={() => save({ ...state, product: v as ProductType })}
                  >
                    {v === "FITTED"
                      ? "Fitted T-shirt"
                      : v === "OVERSIZED"
                        ? "Oversized T-shirt"
                        : "Custom"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold">2) Colour</div>
              <div className="flex flex-wrap gap-2">
                {(["BLACK", "WHITE", "CUSTOM"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={pill(state.color === v)}
                    onClick={() => save({ ...state, color: v as GarmentColor })}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold">3) Fabric</div>
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
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold">5) Placement (dropdown · max 4)</div>

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

              {selectedPlacements.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedPlacements.map((p) => (
                    <Chip key={p} text={PL_LABEL.get(p) ?? p} onRemove={() => removePlacement(p)} />
                  ))}
                </div>
              )}

              <div className="text-xs text-gray-700">
                UI selected: <span className="font-semibold">{selectedPlacements.length}</span> / 4
              </div>

              <div className="text-xs text-gray-700">
                Saved placements (Designs tab): <span className="font-semibold">{placementsCount}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 text-xs text-gray-600">{isPending ? "Saving…" : "Saved"}</div>
        </section>

        {/* Preview */}
        <section className="flex items-center justify-center lg:h-full">
          <div className="w-full max-w-[560px] border-[6px] border-black bg-white h-[420px] sm:h-[520px] lg:h-full flex items-center justify-center">
            <div className="text-4xl sm:text-6xl font-medium tracking-tight">preview</div>
          </div>
        </section>

        {/* Quote */}
        <section className="lg:h-full flex flex-col justify-between border rounded-lg p-4 sm:p-5 bg-white">
          <div className="space-y-4">
            <div>
              <div className="text-lg font-semibold">Quote (WhatsApp)</div>
              <div className="text-sm text-gray-700 mt-1">
                {isBulk ? "Bulk (501+) → WhatsApp quote" : "Order EST. 1 week after confirmation"}
              </div>
            </div>

            <div>
              <div className="text-2xl font-semibold">— EGP</div>
              <div className="text-xs text-gray-600">Pricing pending confirmation</div>
            </div>

            <div>
              <div className="text-xs tracking-wide text-gray-600">QUANTITY</div>
              <div className="mt-2 grid grid-cols-[44px_1fr_44px] border h-10 bg-white">
                <button type="button" onClick={decQty} className="border-r hover:bg-gray-50">
                  −
                </button>
                <div className="flex items-center justify-center text-sm font-medium">{qty}</div>
                <button type="button" onClick={incQty} className="border-l hover:bg-gray-50">
                  +
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                className="h-11 flex items-center justify-center bg-black text-white text-sm font-medium hover:opacity-90"
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
              >
                REQUEST QUOTE
              </a>

              <button type="button" className="h-11 border text-sm font-medium hover:bg-gray-50" disabled>
                ADD TO WISHLIST
              </button>
            </div>

            <div className="text-xs text-gray-600 italic">
              Pricing will be enabled after the pricing table is confirmed.
            </div>

            <div className="text-xs text-gray-600">
              Project: <span className="font-semibold">{buildName}</span>
            </div>
          </div>

          <div className="pt-6 text-sm underline text-right">
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
              Live Assistance
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}