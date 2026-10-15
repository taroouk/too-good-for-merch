"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  MAX_CROP_ZOOM,
  MIN_CROP_PX,
  clampImageOffset,
  fitScale,
  fractionToWindow,
  limitOutputSize,
  minZoomFor,
  resizeRect,
  rotatedSize,
  windowToFraction,
  zoomAboutWindow,
  type CropMeta,
  type Handle,
  type Point,
  type Rect,
  type Size,
} from "src/studio/ui/modals/crop-math";

// Largest side of the exported PNG and a safety margin under the 10MB upload
// limit (MAX_ARTWORK_BYTES in the builder).
const MAX_OUTPUT_SIDE = 4096;
const MAX_OUTPUT_BYTES = 9 * 1024 * 1024;
// Share of the canvas the picture fills when the tool opens.
const STAGE_FILL = 0.84;

const HANDLES: Array<{ id: Handle; style: CSSProperties; cursor: string }> = [
  { id: "nw", style: { left: -7, top: -7 }, cursor: "nwse-resize" },
  { id: "n", style: { left: "50%", top: -7, marginLeft: -7 }, cursor: "ns-resize" },
  { id: "ne", style: { right: -7, top: -7 }, cursor: "nesw-resize" },
  { id: "e", style: { right: -7, top: "50%", marginTop: -7 }, cursor: "ew-resize" },
  { id: "se", style: { right: -7, bottom: -7 }, cursor: "nwse-resize" },
  { id: "s", style: { left: "50%", bottom: -7, marginLeft: -7 }, cursor: "ns-resize" },
  { id: "sw", style: { left: -7, bottom: -7 }, cursor: "nesw-resize" },
  { id: "w", style: { left: -7, top: "50%", marginTop: -7 }, cursor: "ew-resize" },
];

type Drag = { kind: "pan" | Handle; startX: number; startY: number; startWindow: Rect; startOffset: Point };

export type CropResult = { file: File; meta: CropMeta } | null;

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

// The picture, rotated, filling a box of `size` (which is the rotated
// picture's bounding box).
function RotatedPicture({ url, natural, rotation, size, opacity }: { url: string; natural: Size; rotation: number; size: Size; opacity?: number }) {
  const rotated = rotatedSize(natural, rotation);
  const k = rotated.w > 0 ? size.w / rotated.w : 1;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        left: size.w / 2 - (natural.w * k) / 2,
        top: size.h / 2 - (natural.h * k) / 2,
        width: natural.w * k,
        height: natural.h * k,
        maxWidth: "none",
        transform: `rotate(${rotation}deg)`,
        opacity,
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );
}

// Canva-style crop mode, shown IN PLACE of the popup's usual canvas and
// controls. The crop window stays on the canvas while the picture slides and
// zooms underneath it; the window's eight handles resize the window. Nothing
// outside the window is thrown away: `originalUrl` is always the untouched
// upload, and `initial` restores the previous window, so cropping again shows
// the whole picture.
export default function ArtworkCropper({
  originalUrl,
  fileName,
  initial,
  onCancel,
  onApply,
}: {
  originalUrl: string;
  fileName: string;
  initial: CropMeta | null;
  onCancel: () => void;
  onApply: (result: CropResult) => Promise<void> | void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(initial?.rotation ?? 0);
  const [stage, setStage] = useState<Size>({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [win, setWin] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // The saved window is applied once (first layout at the saved rotation);
  // after that a rotation change starts from the whole picture again.
  const pendingInitial = useRef<CropMeta | null>(initial);

  const natural: Size | null = image ? { w: image.naturalWidth || 1024, h: image.naturalHeight || 1024 } : null;
  const rotated = natural ? rotatedSize(natural, rotation) : null;
  // Size of the picture at zoom 1.
  const baseScale = rotated && stage.w > 0 ? fitScale(rotated, { w: stage.w * STAGE_FILL, h: stage.h * STAGE_FILL }, true) : 1;
  const base: Size = rotated ? { w: rotated.w * baseScale, h: rotated.h * baseScale } : { w: 0, h: 0 };
  const imageSize: Size = { w: base.w * zoom, h: base.h * zoom };
  const lowestZoom = minZoomFor(win, base);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setLoadError("Couldn't load this artwork to crop it.");
    };
    img.src = originalUrl;
    return () => {
      cancelled = true;
    };
  }, [originalUrl]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // (Re)lay out whenever the picture, its rotation or the canvas size change:
  // picture centred, window over all of it (or over the saved window once).
  const baseW = base.w;
  const baseH = base.h;
  useEffect(() => {
    if (baseW <= 0 || baseH <= 0 || stage.w <= 0) return;
    const origin: Point = { x: (stage.w - baseW) / 2, y: (stage.h - baseH) / 2 };
    const saved = pendingInitial.current;
    pendingInitial.current = null;
    setZoom(1);
    setOffset(origin);
    setWin(saved && saved.rotation === rotation ? fractionToWindow(saved.window, origin, { w: baseW, h: baseH }) : { x: origin.x, y: origin.y, w: baseW, h: baseH });
    setReady(true);
  }, [image, rotation, baseW, baseH, stage.w, stage.h]);

  function begin(kind: Drag["kind"], event: ReactPointerEvent<HTMLElement>) {
    if (!ready || working) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, startX: event.clientX, startY: event.clientY, startWindow: win, startOffset: offset };
  }

  function onMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.kind === "pan") {
      setOffset(clampImageOffset({ x: drag.startOffset.x + dx, y: drag.startOffset.y + dy }, imageSize, win));
      return;
    }
    // Resize the window inside the picture (work in the picture's own space).
    const local: Rect = { x: drag.startWindow.x - offset.x, y: drag.startWindow.y - offset.y, w: drag.startWindow.w, h: drag.startWindow.h };
    const next = resizeRect(local, drag.kind, dx, dy, imageSize, MIN_CROP_PX);
    setWin({ x: next.x + offset.x, y: next.y + offset.y, w: next.w, h: next.h });
  }

  function onUp(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  function changeZoom(next: number) {
    const z = Math.min(MAX_CROP_ZOOM, Math.max(lowestZoom, next));
    const nextSize = { w: base.w * z, h: base.h * z };
    setOffset((current) => zoomAboutWindow(current, imageSize, win, nextSize));
    setZoom(z);
  }

  function resetAll() {
    setError(null);
    if (rotation !== 0) {
      setRotation(0); // the layout effect restores the whole picture
    } else if (base.w > 0) {
      const origin = { x: (stage.w - base.w) / 2, y: (stage.h - base.h) / 2 };
      setZoom(1);
      setOffset(origin);
      setWin({ x: origin.x, y: origin.y, w: base.w, h: base.h });
    }
  }

  async function done() {
    if (!image || !natural || !rotated || !ready) return;
    setError(null);
    const fraction = windowToFraction(win, offset, imageSize);
    const whole = fraction.x < 0.002 && fraction.y < 0.002 && fraction.w > 0.996 && fraction.h > 0.996;
    // Whole picture, unrotated: back to the untouched original.
    if (whole && rotation === 0) {
      setWorking(true);
      try {
        await onApply(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not crop this artwork.");
      } finally {
        setWorking(false);
      }
      return;
    }

    setWorking(true);
    try {
      // 1. Rotated copy of the ORIGINAL pixels (capped so a huge file can't blow the upload limit).
      const { size: workSize, factor } = limitOutputSize({ w: Math.round(rotated.w), h: Math.round(rotated.h) }, MAX_OUTPUT_SIDE);
      const work = document.createElement("canvas");
      work.width = workSize.w;
      work.height = workSize.h;
      const wctx = work.getContext("2d");
      if (!wctx) throw new Error("Your browser can't crop this image.");
      wctx.translate(workSize.w / 2, workSize.h / 2);
      wctx.rotate((rotation * Math.PI) / 180);
      wctx.scale(factor, factor);
      wctx.drawImage(image, -natural.w / 2, -natural.h / 2, natural.w, natural.h);

      // 2. Cut the window out of it.
      const sx = Math.min(workSize.w - 1, Math.max(0, Math.round(fraction.x * workSize.w)));
      const sy = Math.min(workSize.h - 1, Math.max(0, Math.round(fraction.y * workSize.h)));
      const sw = Math.min(workSize.w - sx, Math.max(1, Math.round(fraction.w * workSize.w)));
      const sh = Math.min(workSize.h - sy, Math.max(1, Math.round(fraction.h * workSize.h)));
      let out = document.createElement("canvas");
      out.width = sw;
      out.height = sh;
      out.getContext("2d")?.drawImage(work, sx, sy, sw, sh, 0, 0, sw, sh);

      // 3. PNG (keeps transparency); shrink if it would exceed the upload limit.
      let blob = await canvasToPngBlob(out);
      for (let attempt = 0; blob && blob.size > MAX_OUTPUT_BYTES && attempt < 4; attempt++) {
        const smaller = document.createElement("canvas");
        smaller.width = Math.max(1, Math.round(out.width * 0.75));
        smaller.height = Math.max(1, Math.round(out.height * 0.75));
        smaller.getContext("2d")?.drawImage(out, 0, 0, smaller.width, smaller.height);
        out = smaller;
        blob = await canvasToPngBlob(out);
      }
      if (!blob || blob.size === 0 || blob.size > MAX_OUTPUT_BYTES) throw new Error("The cropped image is too large. Try a smaller area.");

      const baseName = fileName.replace(/-cropped(?=\.[a-z0-9]+$)/i, "").replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "artwork";
      await onApply({
        file: new File([blob], `${baseName}-cropped.png`, { type: "image/png" }),
        meta: { rotation, window: fraction },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not crop this artwork.");
    } finally {
      setWorking(false);
    }
  }

  const imageBox: CSSProperties = { position: "absolute", left: offset.x, top: offset.y, width: imageSize.w, height: imageSize.h, overflow: "hidden" };

  return (
    <div
      role="dialog"
      aria-label="Crop artwork"
      className="absolute inset-0 z-[50] flex flex-col bg-white text-black md:flex-row"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div
        ref={stageRef}
        className="relative min-h-[300px] flex-1 touch-none select-none overflow-hidden border-b border-black bg-[#ecebe7] md:min-h-0 md:border-b-0 md:border-r"
        onPointerDown={(event) => begin("pan", event)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ cursor: "grab" }}
      >
        {loadError ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-600">{loadError}</p>
        ) : !image || !ready || !natural ? (
          <p className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[.18em] text-black/45">Loading…</p>
        ) : (
          <>
            {/* The whole picture, faded: what is outside the window. */}
            <div style={imageBox} data-testid="crop-faded">
              <RotatedPicture url={originalUrl} natural={natural} rotation={rotation} size={imageSize} opacity={0.35} />
            </div>

            {/* Full strength inside the window. */}
            <div style={{ position: "absolute", left: win.x, top: win.y, width: win.w, height: win.h, overflow: "hidden", pointerEvents: "none" }} data-testid="crop-window-content">
              <div style={{ position: "absolute", left: offset.x - win.x, top: offset.y - win.y, width: imageSize.w, height: imageSize.h }}>
                <RotatedPicture url={originalUrl} natural={natural} rotation={rotation} size={imageSize} />
              </div>
            </div>

            {/* Window outline, thirds guides and the eight handles. */}
            <div
              className="absolute border-2 border-white"
              style={{ left: win.x, top: win.y, width: win.w, height: win.h, boxShadow: "0 0 0 1px rgba(0,0,0,.45)", pointerEvents: "none" }}
              data-testid="crop-window"
            >
              <div
                className="absolute inset-0 opacity-50"
                style={{
                  backgroundImage:
                    "linear-gradient(#fff,#fff),linear-gradient(#fff,#fff),linear-gradient(90deg,#fff,#fff),linear-gradient(90deg,#fff,#fff)",
                  backgroundSize: "100% 1px,100% 1px,1px 100%,1px 100%",
                  backgroundPosition: "0 33.33%,0 66.66%,33.33% 0,66.66% 0",
                  backgroundRepeat: "no-repeat",
                }}
              />
              {HANDLES.map((handle) => (
                <span
                  key={handle.id}
                  role="slider"
                  aria-label={`Crop handle ${handle.id}`}
                  aria-valuenow={0}
                  className="absolute block h-[14px] w-[14px] rounded-[3px] border border-black/50 bg-white shadow"
                  style={{ ...handle.style, cursor: handle.cursor, touchAction: "none", pointerEvents: "auto" }}
                  onPointerDown={(event) => begin(handle.id, event)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto bg-white p-5 md:w-[340px] md:p-7">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[.2em]">Crop</h2>
          <p className="mt-2 text-xs leading-5 text-black/55">Drag the picture to reposition it. Drag the corners or edges to choose what to keep. Your original is never lost.</p>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="crop-rotate" className="text-[11px] font-semibold uppercase tracking-[.18em] text-black/60">Rotate</label>
            <span className="text-xs tabular-nums text-black/55">{rotation}°</span>
          </div>
          <input
            id="crop-rotate"
            type="range"
            min={-180}
            max={180}
            step={1}
            value={rotation}
            onChange={(event) => setRotation(Number(event.target.value))}
            className="mt-3 w-full accent-black"
            disabled={!ready || working}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="crop-zoom" className="text-[11px] font-semibold uppercase tracking-[.18em] text-black/60">Zoom</label>
            <span className="text-xs tabular-nums text-black/55">{Math.round(zoom * 100)}%</span>
          </div>
          <input
            id="crop-zoom"
            type="range"
            min={lowestZoom}
            max={MAX_CROP_ZOOM}
            step={0.01}
            value={Math.min(MAX_CROP_ZOOM, Math.max(lowestZoom, zoom))}
            onChange={(event) => changeZoom(Number(event.target.value))}
            className="mt-3 w-full accent-black"
            disabled={!ready || working}
          />
        </div>

        {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

        <div className="mt-auto flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void done()}
            disabled={!ready || working}
            aria-busy={working}
            className="h-12 w-full bg-black text-xs font-semibold uppercase tracking-[.2em] text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {working ? "Applying…" : "Done"}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={resetAll} disabled={!ready || working} className="h-11 border border-black/20 text-xs font-semibold uppercase tracking-[.16em] transition hover:border-black disabled:opacity-50">
              Reset
            </button>
            <button type="button" onClick={onCancel} disabled={working} className="h-11 border border-black/20 text-xs font-semibold uppercase tracking-[.16em] transition hover:border-black disabled:opacity-50">
              Cancel
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
