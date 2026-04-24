"use client";

import { useState } from "react";

type ViewSide = "FRONT" | "BACK" | "LEFT" | "RIGHT";

type PlacementKey =
  | "LEFT_CHEST"
  | "RIGHT_CHEST"
  | "RIGHT_SLEEVE"
  | "LEFT_SLEEVE"
  | "CENTER_FRONT"
  | "FULL_FRONT"
  | "CENTER_BACK"
  | "FULL_BACK";

type Props = {
  product: string | null;
  color: string | null;
  customHex?: string;
  artworkUrl: string | null;
  selectedPlacements: PlacementKey[];
};

const PLACEMENT_POSITIONS: Record<
  PlacementKey,
  { x: number; y: number; size: number }
> = {
  LEFT_CHEST: { x: 43, y: 38, size: 70 },
  RIGHT_CHEST: { x: 57, y: 38, size: 70 },
  RIGHT_SLEEVE: { x: 73, y: 39, size: 55 },
  LEFT_SLEEVE: { x: 27, y: 39, size: 55 },
  CENTER_FRONT: { x: 50, y: 47, size: 115 },
  FULL_FRONT: { x: 50, y: 52, size: 190 },
  CENTER_BACK: { x: 50, y: 46, size: 120 },
  FULL_BACK: { x: 50, y: 52, size: 200 },
};

function getImage(side: ViewSide) {
  if (side === "BACK") return "/images/mockups/tshirt-back.png";
  if (side === "LEFT") return "/images/mockups/tshirt-left.png";
  if (side === "RIGHT") return "/images/mockups/tshirt-right.png";
  return "/images/mockups/tshirt-front.png";
}

function getColorValue(color: string | null, customHex?: string) {
  if (color === "BLACK") return "#050505";
  if (color === "WHITE") return "#ffffff";
  if (color === "CUSTOM") return customHex || "#111827";
  return "#ffffff";
}

export default function LiveMockupPreview({
  color,
  customHex,
  artworkUrl,
  selectedPlacements,
}: Props) {
  const [side, setSide] = useState<ViewSide>("FRONT");
  const [logoPos, setLogoPos] = useState({ x: 50, y: 45 });
  const [logoSize, setLogoSize] = useState(95);
  const [dragging, setDragging] = useState(false);

  const shirtImage = getImage(side);
  const shirtColor = getColorValue(color, customHex);

  const activePlacement = selectedPlacements[0];
  const placement = activePlacement
    ? PLACEMENT_POSITIONS[activePlacement]
    : null;

  function snapToPlacement() {
    if (!placement) return;
    setLogoPos({ x: placement.x, y: placement.y });
    setLogoSize(placement.size);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setLogoPos({
      x: Math.max(12, Math.min(88, x)),
      y: Math.max(16, Math.min(72, y)),
    });
  }

  return (
    <section className="min-w-0">
      <div className="mx-auto w-full max-w-[650px]">
        <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
          {(["FRONT", "BACK", "LEFT", "RIGHT"] as ViewSide[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSide(item)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                side === item
                  ? "border-black bg-black text-white"
                  : "border-black/20 bg-white text-black hover:bg-black/5"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div
          className="relative aspect-square w-full overflow-hidden bg-[#f2f2f2] shadow-[0_18px_60px_rgba(0,0,0,0.08)]"
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => setDragging(false)}
        >
          <img
            src={shirtImage}
            alt="T-shirt mockup"
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-contain"
          />

          <div
            className="pointer-events-none absolute inset-0 opacity-30 mix-blend-multiply"
            style={{
              backgroundColor: shirtColor,
              WebkitMaskImage: `url(${shirtImage})`,
              maskImage: `url(${shirtImage})`,
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
            }}
          />

          {artworkUrl && (
            <img
              src={artworkUrl}
              alt="Uploaded artwork"
              draggable={false}
              onPointerDown={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              className="absolute cursor-move select-none mix-blend-multiply opacity-90"
              style={{
                width: `${logoSize}px`,
                left: `${logoPos.x}%`,
                top: `${logoPos.y}%`,
                transform: "translate(-50%, -50%)",
                filter:
                  "contrast(1.08) saturate(0.9) drop-shadow(0 1px 1px rgba(0,0,0,0.20))",
              }}
            />
          )}

          {placement && !artworkUrl && (
            <button
              type="button"
              onClick={snapToPlacement}
              className="absolute rounded-full bg-black px-3 py-1 text-[11px] font-semibold text-white shadow-lg"
              style={{
                left: `${placement.x}%`,
                top: `${placement.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              Place here
            </button>
          )}
        </div>

        {artworkUrl && (
          <div className="mt-3 rounded-2xl bg-white p-3 shadow">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={snapToPlacement}
                className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white"
              >
                Snap
              </button>

              <input
                type="range"
                min={40}
                max={220}
                value={logoSize}
                onChange={(e) => setLogoSize(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}

        <div className="mt-3 text-center text-xs text-black/50">
          Upload artwork and drag it
        </div>
      </div>
    </section>
  );
}