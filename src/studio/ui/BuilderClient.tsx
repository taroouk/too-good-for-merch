// src/studio/ui/BuilderClient.tsx
"use client";

import { useState, useTransition } from "react";
import type { BuildDraft, FabricType, GarmentColor, ProductType } from "@prisma/client";
import { actionUpdateDraft } from "src/actions/build-actions";
import { WHATSAPP_URL } from "src/lib/whatsapp";

type DraftDTO = Pick<
  BuildDraft,
  "product" | "color" | "fabric" | "quantity" | "customNotes" | "primaryAssetId"
>;

function pill(active: boolean) {
  return `px-3 py-1 rounded-full border text-sm ${
    active ? "bg-black text-white" : "hover:bg-gray-50"
  }`;
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

  const qty = state.quantity ?? 1;
  const isBulk = qty >= 501;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Left: Controls */}
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
                {v === "FITTED"
                  ? "Fitted T-shirt"
                  : v === "OVERSIZED"
                    ? "Oversized T-shirt"
                    : "Custom"}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="font-medium">2) Colour</div>
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
        </section>

        <section className="space-y-2">
          <div className="font-medium">3) Fabric</div>
          <select
            className="w-full border rounded-md p-2 text-sm"
            value={state.fabric ?? ""}
            onChange={(e) =>
              save({ ...state, fabric: (e.target.value || null) as FabricType | null })
            }
          >
            <option value="">Select fabric…</option>
            <option value="ESSENTIALS_170">Essentials · 170 GSM</option>
            <option value="SIGNATURE_200">Signature · 200 GSM</option>
            <option value="HEAVYWEIGHT_300">Heavyweight · 300 GSM</option>
          </select>
        </section>

        <section className="space-y-2">
          <div className="font-medium">4) Upload artwork</div>
          <div className="text-sm text-gray-600">
            Phase 4: upload storage is stubbed. Storage wiring comes in Phase 5.
          </div>
          <a className="text-sm underline" href={WHATSAPP_URL} target="_blank" rel="noreferrer">
            Request artwork help via WhatsApp
          </a>
        </section>

        <section className="space-y-2">
          <div className="font-medium">5) Placement</div>
          <div className="text-sm text-gray-600">Phase 4: placements managed in Designs tab.</div>
          <div className="text-xs text-gray-600">Current placements: {placementsCount}</div>
        </section>

        <div className="text-xs text-gray-600">{isPending ? "Saving…" : "Saved"}</div>
      </div>

      {/* Right: Preview + Quote */}
      <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <div className="font-medium mb-2">Preview</div>
          <div className="aspect-[3/4] w-full border rounded-md flex items-center justify-center text-sm text-gray-600">
            Preview placeholder (Phase 4)
          </div>
        </div>

        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Quote</div>
            <div className="text-sm text-gray-600">WhatsApp</div>
          </div>

          <div className="text-sm text-gray-700">
            {isBulk
              ? "Bulk orders (501+) require a custom quote on WhatsApp."
              : "Request a quote on WhatsApp. We’ll ask for the details we need."}
          </div>

          <label className="block text-sm">
            Quantity
            <input
              className="mt-1 w-full border rounded-md p-2"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => save({ ...state, quantity: Number(e.target.value || 1) })}
            />
          </label>

          <a
            className="w-full border rounded-md px-4 py-2 text-sm hover:bg-gray-50 text-center block"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
          >
            Request quote on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}