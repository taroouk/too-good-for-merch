"use client";

import { useState } from "react";

type Props = {
  artworkUrl: string | null;
};

type ModelCardProps = {
  src: string;
  alt: string;
  artworkUrl: string | null;
  logoPos: { x: number; y: number };
  size: number;
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
  setLogoPos: (position: { x: number; y: number }) => void;
};

function ModelCard({
  src,
  alt,
  artworkUrl,
  logoPos,
  size,
  dragging,
  setDragging,
  setLogoPos,
}: ModelCardProps) {
  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setLogoPos({
      x: Math.max(20, Math.min(80, x)),
      y: Math.max(18, Math.min(62, y)),
    });
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-[#f2f2f2] shadow-[0_20px_70px_rgba(0,0,0,0.10)]"
      onPointerMove={handleMove}
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="w-full select-none object-contain"
      />

      {artworkUrl && (
        <>
          <img
            src={artworkUrl}
            alt="Artwork preview"
            draggable={false}
            onPointerDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            className="absolute cursor-move select-none mix-blend-multiply opacity-90"
            style={{
              width: `${size}px`,
              left: `${logoPos.x}%`,
              top: `${logoPos.y}%`,
              transform: "translate(-50%, -50%)",
              filter:
                "contrast(1.05) saturate(0.92) drop-shadow(0 1px 1px rgba(0,0,0,0.18))",
            }}
          />

          <div
            className="pointer-events-none absolute inset-0 opacity-[0.10] mix-blend-overlay"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(0,0,0,.35) 0px, rgba(0,0,0,.35) 1px, transparent 1px, transparent 5px)",
            }}
          />
        </>
      )}
    </div>
  );
}

export default function DualMockup({ artworkUrl }: Props) {
  const [logoPos, setLogoPos] = useState({ x: 50, y: 38 });
  const [size, setSize] = useState(95);
  const [dragging, setDragging] = useState(false);

  return (
    <section className="order-2 min-w-0">
      <div className="mx-auto w-full max-w-[760px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ModelCard
            src="/images/models/male.png"
            alt="Male model mockup"
            artworkUrl={artworkUrl}
            logoPos={logoPos}
            size={size}
            dragging={dragging}
            setDragging={setDragging}
            setLogoPos={setLogoPos}
          />
          <ModelCard
            src="/images/models/female.png"
            alt="Female model mockup"
            artworkUrl={artworkUrl}
            logoPos={logoPos}
            size={size}
            dragging={dragging}
            setDragging={setDragging}
            setLogoPos={setLogoPos}
          />
        </div>

        {artworkUrl && (
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-black/60">
                Logo size
              </span>

              <input
                type="range"
                min={45}
                max={180}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="mt-2 text-xs text-black/45">
              Drag the logo on the shirt. The print uses blend + fabric texture
              for a more realistic preview.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
