// src/studio/ui/BuilderClient.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import type { BuildDraft, FabricType, GarmentColor, ProductType } from "@prisma/client";
import { actionUpdateDraft } from "src/actions/build-actions";
import { computePriceStub } from "src/pricing/engine";

type DraftDTO = Pick<BuildDraft, "product" | "color" | "fabric" | "quantity" | "customNotes" | "primaryAssetId">;

function pill(active: boolean) {
  return `px-3 py-1 rounded-full border text-sm ${active ? "bg-black text-white" : "hover:bg-gray-50"}`;
}

export default function BuilderClient({
  buildId,
  buildName,
  draft,
}: {
  buildId: string;
  buildName: string;
  draft: DraftDTO;
}) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<DraftDTO>(draft);

  const pricing = useMemo(() => {
    const placementsCount = 0;
    return computePriceStub({
      product: state.product,
      color: state.color,
      fabric: state.fabric,
      quantity: state.quantity ?? 1,
      placementsCount,
    });
  }, [state]);

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

  const isCustom = state.product === "CUSTOM";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-6">
        <div>
          <div className="text-xl font-semibold">{buildName}</div>
          <div className="text-xs text-gray-600">Builder</div>
        </div>

        <section className="space-y-2">
          <div className="font-medium">1) Product</div>
          <div className="flex flex-wrap gap-2">
            {(["FITTED", "OVERSIZED", "CUSTOM"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={pill(state.product === v)}
                onClick={() => save({ ...state, product: v as ProductType })}
              >
                {v === "FITTED" ? "Fitted T-shirt" : v === "OVERSIZED" ? "Oversized T-shirt" : "Custom"}
              </button>
            ))}
          </div>

          {isCustom && (
            <div className="border rounded-lg p-3 text-sm space-y-2">
              <div className="font-medium">Custom Garment Request</div>
              <div className="text-gray-600">
                Custom garment constructions are not available for instant checkout. We’ll review your request and provide a tailored quote.
              </div>
              <label className="block text-sm">
                Notes
                <textarea
                  className="mt-1 w-full border rounded-md p-2"
                  value={state.customNotes ?? ""}
                  onChange={(e) => save({ ...state, customNotes: e.target.value })}
                  placeholder="Describe what you need..."
                />
              </label>
              <div className="flex gap-2">
                <a className="border rounded-md px-3 py-2 text-sm hover:bg-gray-50" href="https://wa.me/" target="_blank" rel="noreferrer">
                  Continue on WhatsApp
                </a>
                <button
                  type="button"
                  className="border rounded-md px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => save({ ...state, product: "FITTED" })}
                >
                  Go back
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="font-medium">2) Colour</div>
          <div className="flex flex-wrap gap-2">
            {(["BLACK", "WHITE", "CUSTOM"] as const).map((v) => (
              <button key={v} type="button" className={pill(state.color === v)} onClick={() => save({ ...state, color: v as GarmentColor })}>
                {v}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="font-medium">3) Fabric</div>
          <select
            className="w-full border rounded-md p-2 text-sm"
            value={state.fabric ?? ""}
            onChange={(e) => save({ ...state, fabric: (e.target.value || null) as FabricType | null })}
          >
            <option value="">Select fabric…</option>
            <option value="ESSENTIALS_170">Essentials · 170 GSM</option>
            <option value="SIGNATURE_200">Signature · 200 GSM</option>
            <option value="HEAVYWEIGHT_300">Heavyweight · 300 GSM</option>
          </select>
        </section>

        <section className="space-y-2">
          <div className="font-medium">4) Upload artwork</div>
          <div className="text-sm text-gray-600">Phase 4: upload storage is stubbed. Storage wiring comes in Phase 5.</div>
          <a className="text-sm underline" href="https://wa.me/" target="_blank" rel="noreferrer">
            Request artwork help via WhatsApp
          </a>
        </section>

        <section className="space-y-2">
          <div className="font-medium">5) Placement</div>
          <div className="text-sm text-gray-600">Phase 4: placements managed in Designs tab.</div>
        </section>

        <div className="text-xs text-gray-600">{isPending ? "Saving…" : "Saved"}</div>
      </div>

      <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <div className="font-medium mb-2">Preview</div>
          <div className="aspect-[3/4] w-full border rounded-md flex items-center justify-center text-sm text-gray-600">
            Preview placeholder (Phase 4)
          </div>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Price</div>
            <div className="text-sm text-gray-600">{pricing.currency}</div>
          </div>

          <div className="text-2xl font-semibold">{pricing.total.toLocaleString()}</div>
          <div className="text-xs text-gray-600">Unit: {pricing.unit.toLocaleString()}</div>

          <label className="block text-sm">
            Quantity
            <input
              className="mt-1 w-full border rounded-md p-2"
              type="number"
              min={1}
              value={state.quantity ?? 1}
              onChange={(e) => save({ ...state, quantity: Number(e.target.value || 1) })}
            />
          </label>

          <button className="w-full border rounded-md px-4 py-2 text-sm hover:bg-gray-50" type="button">
            Add to bag (Phase 5)
          </button>
        </div>
      </div>
    </div>
  );
}