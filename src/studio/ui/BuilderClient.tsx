/* 
FILE: src/studio/ui/BuilderClient.tsx
REPLACE WHOLE FILE
*/
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

const PLACEMENTS: Array<{ key: PlacementKey; label: string; hint: string }> = [
  { key: "LEFT_CHEST", label: "Left Chest", hint: "small logo" },
  { key: "RIGHT_CHEST", label: "Right Chest", hint: "small logo" },
  { key: "RIGHT_SLEEVE", label: "Right Sleeve", hint: "sleeve print" },
  { key: "LEFT_SLEEVE", label: "Left Sleeve", hint: "sleeve print" },
  { key: "CENTER_FRONT", label: "Center Front", hint: "medium print" },
  { key: "FULL_FRONT", label: "Full Front", hint: "large print" },
  { key: "CENTER_BACK", label: "Center Back", hint: "medium print" },
  { key: "FULL_BACK", label: "Full Back", hint: "large print" },
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm transition border",
        active
          ? "bg-white text-black border-white"
          : "bg-transparent text-white/90 border-white/20 hover:border-white/40 hover:bg-white/5"
      )}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-white/90 text-sm font-medium">{children}</div>;
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-white/90 text-sm font-semibold">{n}/</div>
      <div className="text-white/90 text-sm font-semibold">{title}</div>
    </div>
  );
}

function PlacementCard({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition w-full",
        active
          ? "border-emerald-400/70 bg-emerald-400/10"
          : "border-white/15 bg-white/5 hover:bg-white/10 hover:border-white/25"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-white/90 text-sm font-medium">{label}</div>
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            active ? "bg-emerald-400" : "bg-white/25"
          )}
        />
      </div>

      {/* Simple inline tee sketch (placeholder). Replace with images in public/ if you want exact */}
      <div className="mt-3 rounded-lg bg-sky-200/90 p-3">
        <svg viewBox="0 0 240 200" className="w-full h-auto">
          <path
            d="M60 35 L90 20 L150 20 L180 35 L210 70 L185 85 L170 60 L170 175 L70 175 L70 60 L55 85 L30 70 Z"
            fill="white"
            stroke="rgba(0,0,0,0.25)"
            strokeWidth="3"
          />
          {/* print block */}
          <rect
            x="95"
            y="85"
            width="50"
            height="30"
            rx="6"
            fill="rgba(59,130,246,0.75)"
          />
        </svg>
      </div>
    </button>
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

  const [placementUI, setPlacementUI] = useState<PlacementKey>("LEFT_CHEST");

  const qty = useMemo(() => (state.quantity && state.quantity > 0 ? state.quantity : 1), [state.quantity]);
  const isBulk = qty >= 501;
  const isCustom = state.product === "CUSTOM";

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

  return (
    <div className="min-h-[calc(100vh-120px)]">
      <div className="grid gap-4 lg:grid-cols-[440px_1fr]">
        {/* LEFT PANEL (Figma-like dark) */}
        <aside className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-5 lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-white text-lg font-semibold">{buildName}</div>
              <div className="text-white/50 text-xs mt-1">The Studio (mobile-first)</div>
            </div>
            <div className="text-xs text-white/50">{isPending ? "Saving…" : "Saved"}</div>
          </div>

          <div className="mt-5 space-y-6">
            {/* 1 Product */}
            <section className="space-y-3">
              <StepTitle n={1} title="Product (pill buttons)" />
              <div className="flex flex-wrap gap-2">
                <Pill
                  active={state.product === "FITTED"}
                  onClick={() => save({ ...state, product: "FITTED" as ProductType })}
                >
                  Fitted T-shirt
                </Pill>
                <Pill
                  active={state.product === "OVERSIZED"}
                  onClick={() => save({ ...state, product: "OVERSIZED" as ProductType })}
                >
                  Oversized T-shirt
                </Pill>
                <Pill
                  active={state.product === "CUSTOM"}
                  onClick={() => save({ ...state, product: "CUSTOM" as ProductType })}
                >
                  Custom
                </Pill>
              </div>

              {isCustom && (
                <div className="rounded-2xl border border-white/15 bg-white/5 p-4 space-y-3">
                  <div className="text-white font-semibold text-sm">Custom Garment Request</div>
                  <div className="text-white/70 text-sm leading-relaxed">
                    Custom garment constructions are not available for instant checkout.
                    <br />
                    We’ll review your request and provide a tailored quote.
                  </div>

                  <FieldLabel>Body copy</FieldLabel>
                  <textarea
                    className="w-full rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
                    value={state.customNotes ?? ""}
                    onChange={(e) => save({ ...state, customNotes: e.target.value })}
                    placeholder="Describe what you need..."
                    rows={4}
                  />

                  <div className="flex flex-wrap gap-2">
                    <a
                      className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Continue with Custom Request (WhatsApp)
                    </a>
                    <button
                      type="button"
                      className="rounded-xl border border-white/15 bg-transparent px-4 py-2 text-sm text-white/90 hover:bg-white/5"
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
              <StepTitle n={2} title="Colour (pill buttons)" />
              <div className="flex flex-wrap gap-2">
                <Pill
                  active={state.color === "BLACK"}
                  onClick={() => save({ ...state, color: "BLACK" as GarmentColor })}
                >
                  Black
                </Pill>
                <Pill
                  active={state.color === "WHITE"}
                  onClick={() => save({ ...state, color: "WHITE" as GarmentColor })}
                >
                  White
                </Pill>
                <Pill
                  active={state.color === "CUSTOM"}
                  onClick={() => save({ ...state, color: "CUSTOM" as GarmentColor })}
                >
                  Custom
                </Pill>
              </div>
            </section>

            {/* 3 Fabric */}
            <section className="space-y-3">
              <StepTitle n={3} title="Fabric (dropdown)" />
              <select
                className="w-full rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white outline-none focus:border-white/30"
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

              <div className="text-xs text-white/55 leading-relaxed">
                Essentials: lightweight, breathable.
                <br />
                Signature: smooth, premium.
                <br />
                Heavyweight: substantial, structured.
              </div>
            </section>

            {/* 4 Upload artwork */}
            <section className="space-y-2">
              <StepTitle n={4} title="Upload artwork" />
              <div className="text-sm text-white/70">
                Request artwork help via WhatsApp.
              </div>
              <a
                className="inline-block text-sm text-emerald-300 hover:text-emerald-200 underline"
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
              >
                Request artwork (WhatsApp)
              </a>
            </section>

            {/* 5 Placement */}
            <section className="space-y-3">
              <StepTitle n={5} title="Placement" />
              <div className="text-xs text-white/55">
                Phase 4: placements are managed in Designs tab.
              </div>

              <div className="grid grid-cols-2 gap-3">
                {PLACEMENTS.slice(0, 4).map((p) => (
                  <PlacementCard
                    key={p.key}
                    label={p.label}
                    active={placementUI === p.key}
                    onClick={() => setPlacementUI(p.key)}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {PLACEMENTS.slice(4, 8).map((p) => (
                  <PlacementCard
                    key={p.key}
                    label={p.label}
                    active={placementUI === p.key}
                    onClick={() => setPlacementUI(p.key)}
                  />
                ))}
              </div>

              <div className="text-xs text-white/60">
                Current placements (saved in Designs):{" "}
                <span className="text-white font-semibold">{placementsCount}</span>
              </div>
            </section>
          </div>
        </aside>

        {/* RIGHT PANEL (Preview + Quote like Figma) */}
        <section className="space-y-4">
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-semibold">The studio</div>
            <div className="text-xs text-gray-600 mt-1">Preview + Quote (WhatsApp)</div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
              {/* Preview area */}
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <div>HOME</div>
                  <div className="font-semibold text-gray-900">TOO GOOD FOR MERCH</div>
                  <div>ACCOUNT · WISHLIST · BAG</div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
                  {/* empty print area */}
                  <div className="rounded-lg bg-gray-200 aspect-[3/4]" />

                  {/* model placeholder */}
                  <div className="rounded-lg border aspect-[3/4] flex items-center justify-center text-sm text-gray-500">
                    Model preview (replace with image)
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-600">
                  1/ front · 2/ side · 3/ back
                </div>
              </div>

              {/* Quote box */}
              <div className="rounded-xl border bg-white p-4 space-y-3">
                <div className="text-sm font-semibold">Quote</div>

                <div className="text-xs text-gray-600">
                  {isBulk
                    ? "Bulk (501+) requires WhatsApp quote."
                    : "Instant checkout disabled — WhatsApp quote only (Phase 4)."}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Product</span>
                    <span className="font-medium">
                      {state.product ?? "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Colour</span>
                    <span className="font-medium">
                      {state.color ?? "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Fabric</span>
                    <span className="font-medium">
                      {state.fabric ?? "-"}
                    </span>
                  </div>

                  <label className="block text-sm">
                    <span className="text-gray-600">Quantity</span>
                    <input
                      className="mt-1 w-full rounded-lg border p-2"
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) => save({ ...state, quantity: Number(e.target.value || 1) })}
                    />
                  </label>
                </div>

                <a
                  className="block w-full rounded-lg border px-4 py-2 text-sm text-center hover:bg-gray-50"
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Request quote on WhatsApp
                </a>

                <div className="text-[11px] text-gray-500">
                  Tip: when pricing table is confirmed, we’ll enable live pricing here.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}