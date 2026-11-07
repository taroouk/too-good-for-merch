/* eslint-disable @next/next/no-img-element */
import { useCallback, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEventHandler,
  PointerEventHandler,
} from "react";
import type { GarmentColor, ProductType } from "@prisma/client";

import type { PlacementKey } from "src/pricing/placements";
// Both zero server-only imports (no node:fs, no sharp) -- safe to import
// directly from a client component, same as TryOn3DPreview.tsx already
// does. This is the canonical placement/template geometry the server
// compositor also uses -- no local coordinate/aspect-ratio table here.
import { getEffectiveScaleBounds } from "src/studio/render/transform";
import { getPlacementFrameAspect, getPlacementSide } from "src/studio/render/placement-config";
import { getEditorAspectRatio, getEditorPlacementBox } from "src/studio/render/editor-surface";
import { previewArtworkBlend } from "src/studio/render/preview-blend";
import { shouldMountArtworkOverlay } from "src/studio/artwork-overlay-visibility";
import { useEscapeToClose } from "src/studio/ui/modals/useEscapeToClose";
import { isBackdropClick } from "src/studio/ui/modals/modal-a11y";
import { useModalDialog } from "src/studio/ui/modals/useModalDialog";
import ArtworkCropper, { type CropResult } from "src/studio/ui/modals/ArtworkCropper";
import type { CropMeta } from "src/studio/ui/modals/crop-math";
import { artworkKindNotice, type ArtworkKind } from "src/studio/artwork-kind";
import { useImageAspectRatio } from "src/studio/ui/useImageAspectRatio";
import { useTrimmedArtworkUrl } from "src/studio/ui/useTrimmedArtworkUrl";

type ArtworkTransform = {
  x: number;
  y: number;
  scale: number;
  rotation?: number;
};

type UserAssetDTO = {
  id: string;
  buildId?: string | null;
  url: string;
  fileName: string;
  // Set on a cropped copy: the id of the untouched upload it was cut from,
  // and the window/rotation used (so Crop can reopen where it was left).
  cropSourceId?: string | null;
  crop?: CropMeta | null;
};

type PlacementCard = {
  key: PlacementKey;
  label: string;
  image: string;
};

type BespokeModalProps = {
  bespokeShirtSrc: string;
  artworkUrl: string | null;
  // Trim-to-visible-content version of artworkUrl, used ONLY for the
  // overlay <img src> below -- see BuilderClient's useTrimmedArtworkUrl
  // usage. artworkUrl itself must stay untrimmed since it's also used for
  // asset-grid identity comparisons elsewhere in this component. Optional
  // + falls back to artworkUrl so this stays backwards compatible.
  overlayArtworkUrl?: string | null;
  // Transparent vs opaque (and white background) -- informational only.
  artworkKind?: ArtworkKind | null;
  product: ProductType | null;
  color: GarmentColor | null;
  bespokeArtworkStyle: CSSProperties;
  bespokeArtworkTransform: string;
  placementCards: PlacementCard[];
  selectedPlacements: PlacementKey[];
  activePlacement: PlacementKey;
  activeArtworkAsset: UserAssetDTO | null;
  artworkTransform: ArtworkTransform;
  mockupPending: boolean;
  savePending: boolean;
  mockupError: string | null;
  userAssets: UserAssetDTO[];
  selectedPrimaryAssetId?: string | null;
  attachingAssetId: string | null;
  previewRef: (node: HTMLDivElement | null) => void;
  onClose: () => void;
  onArtworkPointerDown: PointerEventHandler<HTMLImageElement>;
  onArtworkPointerMove: PointerEventHandler<HTMLImageElement>;
  onArtworkPointerUp: PointerEventHandler<HTMLImageElement>;
  onPlacementClick: (placement: PlacementKey) => void;
  onAddArtworkClick: () => void;
  onZoomOut: () => void;
  onArtworkScaleChange: ChangeEventHandler<HTMLInputElement>;
  onZoomIn: () => void;
  onResetArtworkTransform: () => void;
  onSelectAsset: (asset: UserAssetDTO) => void;
  // Pick-then-place: the chosen/uploaded image floats over the tee until it is
  // dragged into the placement frame (or "Place it" is pressed).
  stagedAsset: { id: string; url: string; fileName: string } | null;
  onPlaceStaged: () => void;
  onCancelStaged: () => void;
  onRemoveAsset: (asset: UserAssetDTO) => void;
  // Multi-artwork (src/studio/artwork-layers.ts): the OTHER artworks on the
  // side being edited (drawn on the tee, click to edit), every artwork in
  // the design (the Selected Artwork cards), and their actions.
  otherLayers: Array<{ placement: PlacementKey; url: string; style: CSSProperties; transform: string }>;
  layers: Array<{ placement: PlacementKey; url: string; fileName?: string }>;
  onSelectLayer: (placement: PlacementKey) => void;
  onRemoveLayer: (placement: PlacementKey) => void;
  // An image whose file can't be displayed (a broken upload).
  onBrokenArtwork: (url: string) => void;
  // An upload dragged from "Your uploads" and dropped on the tee.
  onDropAsset: (assetId: string, clientX: number, clientY: number) => void;
  removingAssetId: string | null;
  onSaveTShirt: () => void;
  // Crop mode result: a cropped PNG + its crop data (the Builder uploads it as
  // a copy of the original), or null to go back to the untouched original.
  onCropArtwork: (result: CropResult, original: UserAssetDTO | null) => Promise<void> | void;
  onSelectColor: (color: "BLACK" | "WHITE") => void;
};

// Drag payload type for "Your uploads" -> shirt drag & drop.
const ASSET_DRAG_TYPE = "application/x-tgfm-asset";

// Another artwork on the tee (not the one being edited).
function OtherLayerImage({
  layer,
  color,
  onSelect,
}: {
  layer: { placement: PlacementKey; url: string; style: CSSProperties; transform: string };
  color: GarmentColor | null;
  onSelect: (placement: PlacementKey) => void;
}) {
  const trimmed = useTrimmedArtworkUrl(layer.url);
  return (
    <img
      src={trimmed ?? layer.url}
      alt=""
      className="studio-bespoke-artwork studio-bespoke-artwork-other"
      draggable={false}
      onClick={() => onSelect(layer.placement)}
      style={{ position: "absolute", zIndex: 1, pointerEvents: "auto", cursor: "pointer", ...previewArtworkBlend(color), ...layer.style, transform: layer.transform }}
    />
  );
}

// Empty "Your Uploads" slots shown until there are this many uploads.
const EMPTY_UPLOAD_SLOTS = 4;

// File-with-up-arrow glyph used in the empty upload slots (Figma frame).
function UploadFileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 17v-6" />
      <path d="m9.5 13.5 2.5-2.5 2.5 2.5" />
    </svg>
  );
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function BespokeModal({
  bespokeShirtSrc,
  artworkUrl,
  overlayArtworkUrl,
  artworkKind = null,
  product,
  color,
  bespokeArtworkStyle,
  bespokeArtworkTransform,
  placementCards,
  selectedPlacements,
  activePlacement,
  activeArtworkAsset,
  artworkTransform,
  mockupPending,
  savePending,
  mockupError,
  userAssets,
  selectedPrimaryAssetId,
  attachingAssetId,
  previewRef,
  onClose,
  onArtworkPointerDown,
  onArtworkPointerMove,
  onArtworkPointerUp,
  onPlacementClick,
  onAddArtworkClick,
  onZoomOut,
  onArtworkScaleChange,
  onZoomIn,
  onResetArtworkTransform,
  onSelectAsset,
  stagedAsset,
  onPlaceStaged,
  onCancelStaged,
  onRemoveAsset,
  removingAssetId,
  otherLayers,
  layers,
  onSelectLayer,
  onRemoveLayer,
  onDropAsset,
  onBrokenArtwork,
  onSaveTShirt,
  onCropArtwork,
  onSelectColor,
}: BespokeModalProps) {
  // The upload whose × was pressed: its tile shows an inline "Remove this
  // upload?" prompt instead of a browser confirm() dialog.
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  // Highlights the tee while an upload is dragged over it.
  const [dropActive, setDropActive] = useState(false);

  // Escape first dismisses an open remove prompt, then closes the popup.
  // While crop mode is open it only leaves crop mode.
  const [cropping, setCropping] = useState(false);

  useEscapeToClose(() => {
    if (cropping) {
      setCropping(false);
      return;
    }
    if (confirmingRemoveId) setConfirmingRemoveId(null);
    else onClose();
  });

  // The canvas always shows the flat editor tee now (never the generated
  // mockup), so its shape is that one image's shape. Still MEASURED from
  // the loaded image rather than read from a table: a hardcoded ratio goes
  // stale the moment the asset on disk is replaced with a differently
  // cropped one, which is exactly what happened to the model templates
  // before (a 2480x2480 square became a ~1118x2353 portrait) and would
  // silently letterbox the artwork overlay's percentage-based box, which
  // is computed against THIS container. getEditorAspectRatio is only the
  // pre-load fallback -- the tee's own ratio, since a model template's
  // ~0.49 portrait ratio would letterbox a ~1.09 landscape tee until it
  // finished loading.
  const fallbackAspectRatio = getEditorAspectRatio(getPlacementSide(activePlacement));
  const previewAspectRatio = useImageAspectRatio(bespokeShirtSrc, fallbackAspectRatio);

  // Same per-placement ceiling the server's resolvePlacement already
  // enforces (getEffectiveScaleBounds) -- not a second, independently
  // guessed range. Defaults mirror BuilderClient's own state defaults so
  // this never diverges from what the parent actually resolved.
  const scaleBounds = getEffectiveScaleBounds(product ?? "FITTED", color ?? "WHITE", activePlacement);

  const panelRef = useModalDialog<HTMLDivElement>(true);

  // --- Floating (staged) image: dragged over the tee into the placement frame.
  const canvasNodeRef = useRef<HTMLDivElement | null>(null);
  const setCanvasNode = useCallback(
    (node: HTMLDivElement | null) => {
      canvasNodeRef.current = node;
      previewRef(node);
    },
    [previewRef],
  );
  // Top-left of the floating image as fractions of the canvas; null = resting spot.
  const [stagePos, setStagePos] = useState<{ x: number; y: number } | null>(null);
  const [stageOverFrame, setStageOverFrame] = useState(false);
  const [stageDragging, setStageDragging] = useState(false);
  const stageDragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);

  // The placement frame on the tee, in canvas fractions.
  const frameOf = (placement: PlacementKey) => {
    const box = getEditorPlacementBox(product, color, placement);
    const heightFrac = box.heightPct ?? box.widthPct * previewAspectRatio * getPlacementFrameAspect(placement);
    return { x: box.xPct, y: box.yPct, w: box.widthPct, h: heightFrac };
  };
  const frame = frameOf(activePlacement);

  function stageCenterInFrame(el: HTMLElement) {
    const canvas = canvasNodeRef.current?.getBoundingClientRect();
    if (!canvas || !canvas.width || !canvas.height) return false;
    const r = el.getBoundingClientRect();
    const fx = (r.left + r.width / 2 - canvas.left) / canvas.width;
    const fy = (r.top + r.height / 2 - canvas.top) / canvas.height;
    const padX = frame.w * 0.15;
    const padY = frame.h * 0.15;
    return fx >= frame.x - padX && fx <= frame.x + frame.w + padX && fy >= frame.y - padY && fy <= frame.y + frame.h + padY;
  }

  // A cropped copy is the same upload as far as the customer is concerned:
  // it isn't listed on its own, and its original's tile shows as selected.
  const cropOriginal = activeArtworkAsset?.cropSourceId
    ? userAssets.find((asset) => asset.id === activeArtworkAsset.cropSourceId) ?? null
    : null;
  const visibleAssets = userAssets.filter((asset) => !asset.cropSourceId);
  const placementLabelOf = (key: PlacementKey) => placementCards.find((card) => card.key === key)?.label ?? key;
  const orphanLayers = layers.filter((layer) => !visibleAssets.some((asset) => asset.url === layer.url));

  return (
    <div
      className="studio-modal-overlay studio-modal-overlay-soft"
      onClick={(event) => {
        if (isBackdropClick(event.target, event.currentTarget)) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="studio-bespoke-modal studio-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bespoke-modal-title"
        tabIndex={-1}
      >
        <button
          type="button"
          onClick={onClose}
          className="studio-modal-close"
          aria-label="Close bespoke builder"
        >
          ×
        </button>

        <div className="studio-bespoke-scroll">
        <div className="studio-bespoke-preview">
          <div
            ref={setCanvasNode}
            className={cn("studio-bespoke-canvas", dropActive ? "studio-bespoke-canvas-drop" : "")}
            style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", aspectRatio: previewAspectRatio }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(event) => {
              const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE);
              setDropActive(false);
              if (!assetId) return;
              event.preventDefault();
              onDropAsset(assetId, event.clientX, event.clientY);
            }}
          >
           {/* Always the flat editor tee -- this canvas never swaps to the
               generated mockup. The popup is the place you BUILD the
               t-shirt, so it has to keep showing the thing you are
               building and stay draggable/zoomable the whole time;
               generating a mockup used to replace this image with a
               photo of a model and freeze the canvas until something
               re-staled it. The generated mockup is shown on the model
               in the Live Model Preview outside the popup instead, which
               is where a photoreal result belongs. */}
           <img
             src={bespokeShirtSrc}
             alt="T-shirt preview"
             className="studio-bespoke-shirt"
             style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain" }}
           />

            {/* The other artworks on this side: not draggable here -- click
                one to make it the artwork being edited. */}
            {otherLayers.map((layer) => (
              // each artwork is cut off at ITS OWN frame, like the one being edited
              <div
                key={layer.placement}
                style={(() => {
                  const f = frameOf(layer.placement);
                  return {
                    position: "absolute" as const,
                    inset: 0,
                    zIndex: 35,
                    pointerEvents: "none" as const,
                    clipPath: `inset(${f.y * 100}% ${(1 - f.x - f.w) * 100}% ${(1 - f.y - f.h) * 100}% ${f.x * 100}%)`,
                  };
                })()}
              >
                <OtherLayerImage layer={layer} color={color} onSelect={onSelectLayer} />
              </div>
            ))}

            {/* No artwork selected yet: an empty dashed frame marks the print
                area of the selected placement (the same box the artwork will
                be cut off at). Purely decorative: not draggable, ignored by
                screen readers. */}
            {!artworkUrl ? (
              <div
                aria-hidden="true"
                data-testid="empty-print-frame"
                style={{
                  position: "absolute",
                  zIndex: 30,
                  left: `${frame.x * 100}%`,
                  top: `${frame.y * 100}%`,
                  width: `${frame.w * 100}%`,
                  height: `${frame.h * 100}%`,
                  pointerEvents: "none",
                  border: "1.5px dashed rgba(120,120,120,.9)",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                {/* The Figma placeholder sits inside the empty frame so the customer sees where the design will go. */}
                <img
                  src={activePlacement === "CENTER_FRONT" ? "/images/artwork-placeholder-2.png" : "/images/artwork-placeholder.png"}
                  alt=""
                  aria-hidden="true"
                  className="studio-bespoke-artwork-placeholder"
                  draggable={false}
                  style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
                />
              </div>
            ) : null}

            {artworkUrl && shouldMountArtworkOverlay({ artworkUrl }) ? (
              <>
                {/* The print frame: the artwork is cut off at its edges and can
                    never spill past them, however far it is zoomed. The dashed
                    line shows the customer where the print area is. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    zIndex: 38,
                    left: `${frame.x * 100}%`,
                    top: `${frame.y * 100}%`,
                    width: `${frame.w * 100}%`,
                    height: `${frame.h * 100}%`,
                    pointerEvents: "none",
                    border: "1.5px dashed rgba(120,120,120,.9)",
                    borderRadius: 4,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 40,
                    pointerEvents: "none",
                    clipPath: `inset(${frame.y * 100}% ${(1 - frame.x - frame.w) * 100}% ${(1 - frame.y - frame.h) * 100}% ${frame.x * 100}%)`,
                  }}
                >
              <img
                src={overlayArtworkUrl ?? artworkUrl}
                alt="Artwork preview"
                className="studio-bespoke-artwork studio-bespoke-artwork-draggable"
                style={{
                  position: "absolute",
                  zIndex: 1,
                  pointerEvents: "auto",
                  // Mounted, visible and interactive whenever there is
                  // artwork at all -- never gated on mockup freshness.
                  // That gate is what made the canvas look "stuck": this
                  // <img> is the only element carrying onPointerDown, and
                  // dragging is the only thing that invalidates a mockup
                  // (via discardMockups in updateArtworkTransform), so
                  // hiding or unmounting it once a mockup was fresh left
                  // no way to ever start a drag again. Now that the canvas
                  // never swaps to the mockup either (see above), there is
                  // nothing behind this overlay for a mockup to cover, so
                  // there is no freshness-dependent opacity left at all.
                  // See src/studio/artwork-overlay-visibility.ts.
                  ...previewArtworkBlend(color),
                  ...bespokeArtworkStyle,
                  transform: bespokeArtworkTransform,
                }}
                draggable={false}
                onError={() => onBrokenArtwork(artworkUrl)}
                onPointerDown={onArtworkPointerDown}
                onPointerMove={onArtworkPointerMove}
                onPointerUp={onArtworkPointerUp}
                onPointerCancel={onArtworkPointerUp}
              />
                </div>
              </>
            ) : null}

            {/* Pick-then-place: the chosen image floats over the tee. Drag it
                into the dashed frame to put it on this placement. */}
            {stagedAsset ? (
              <>
                <div
                  aria-hidden="true"
                  className="studio-stage-frame"
                  style={{
                    position: "absolute",
                    zIndex: 50,
                    left: `${frame.x * 100}%`,
                    top: `${frame.y * 100}%`,
                    width: `${frame.w * 100}%`,
                    height: `${frame.h * 100}%`,
                    pointerEvents: "none",
                    border: "2px dashed #fff",
                    outline: `2px solid ${stageOverFrame ? "#16a34a" : "rgba(0,0,0,.55)"}`,
                    background: stageOverFrame ? "rgba(34,197,94,.22)" : "rgba(255,255,255,.08)",
                    borderRadius: 6,
                    transition: "background 120ms",
                  }}
                />
                <img
                  src={stagedAsset.url}
                  alt={`${stagedAsset.fileName} — drag into the frame`}
                  draggable={false}
                  className="studio-stage-image"
                  style={{
                    position: "absolute",
                    zIndex: 60,
                    left: `${(stagePos?.x ?? 0.04) * 100}%`,
                    top: `${(stagePos?.y ?? 0.05) * 100}%`,
                    width: "26%",
                    maxHeight: "30%",
                    objectFit: "contain",
                    cursor: stageDragging ? "grabbing" : "grab",
                    touchAction: "none",
                    filter: "drop-shadow(0 8px 18px rgba(0,0,0,.45))",
                    background: "rgba(255,255,255,.9)",
                    borderRadius: 8,
                    padding: 4,
                    transition: stageDragging ? "none" : "left 160ms, top 160ms",
                  }}
                  onPointerDown={(event) => {
                    const canvas = canvasNodeRef.current?.getBoundingClientRect();
                    if (!canvas) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    stageDragRef.current = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setStageDragging(true);
                    setStagePos({ x: (rect.left - canvas.left) / canvas.width, y: (rect.top - canvas.top) / canvas.height });
                  }}
                  onPointerMove={(event) => {
                    const drag = stageDragRef.current;
                    const canvas = canvasNodeRef.current?.getBoundingClientRect();
                    if (!drag || drag.pointerId !== event.pointerId || !canvas) return;
                    const x = Math.min(Math.max((event.clientX - drag.dx - canvas.left) / canvas.width, -0.1), 0.95);
                    const y = Math.min(Math.max((event.clientY - drag.dy - canvas.top) / canvas.height, -0.1), 0.95);
                    setStagePos({ x, y });
                    setStageOverFrame(stageCenterInFrame(event.currentTarget));
                  }}
                  onPointerUp={(event) => {
                    const drag = stageDragRef.current;
                    if (!drag || drag.pointerId !== event.pointerId) return;
                    stageDragRef.current = null;
                    setStageDragging(false);
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    const inside = stageCenterInFrame(event.currentTarget);
                    setStageOverFrame(false);
                    setStagePos(null);
                    if (inside) onPlaceStaged();
                  }}
                  onPointerCancel={() => {
                    stageDragRef.current = null;
                    setStageDragging(false);
                    setStageOverFrame(false);
                    setStagePos(null);
                  }}
                />
                <div
                  role="group"
                  aria-label="Place the image"
                  style={{ position: "absolute", zIndex: 70, left: "50%", bottom: 12, transform: "translateX(-50%)", maxWidth: "calc(100% - 24px)" }}
                  className="flex items-center gap-3 whitespace-nowrap rounded-xl border border-black/10 bg-white py-2 pl-4 pr-2 text-black shadow-[0_6px_20px_rgba(0,0,0,0.14)]"
                >
                  <span className="text-[12px] font-medium leading-none">Drag your image into the frame</span>
                  <button
                    type="button"
                    onClick={onPlaceStaged}
                    className="h-8 shrink-0 whitespace-nowrap rounded-lg border border-black bg-black px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                  >
                    Place it
                  </button>
                  <button
                    type="button"
                    onClick={onCancelStaged}
                    aria-label="Close"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[18px] leading-none text-black/50 transition hover:bg-black/5 hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
                  >
                    ×
                  </button>
                </div>
              </>
            ) : null}
          </div>

          <div className="studio-bespoke-placement-area">
            <div className="studio-bespoke-label">Select Placement</div>

            <div className="studio-placement-grid">
              {placementCards.map((placement) => {
                const active = selectedPlacements.includes(placement.key);
                const isViewed = activePlacement === placement.key;

                return (
                  <button
                    key={placement.key}
                    type="button"
                    onClick={() => onPlacementClick(placement.key)}
                    className={cn(
                      "studio-placement-card",
                      active ? "studio-placement-card-active" : "",
                      isViewed ? "border-black border-2" : ""
                    )}
                    aria-label={placement.label}
                  >
                    <img
                      src={placement.image}
                      alt={placement.label}
                      className="studio-placement-image"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="studio-bespoke-controls">
        <div className="studio-bespoke-controls-scroll">
          {/* Order and content follow the Figma frame (Section -
              Customization Modal): title, Upload Artwork, Your Uploads,
              Save. The zoom/reset tools aren't in that frame (it shows the
              empty state); they appear only once artwork is on the shirt. */}
          <div className="studio-bespoke-header">
            <h2 id="bespoke-modal-title" className="studio-bespoke-title">Build Your T-Shirt</h2>
          </div>

          <div className="studio-bespoke-colour">
            <div className="studio-bespoke-label">T-Shirt Colour</div>
            <div className="studio-colour-row">
              <button
                type="button"
                aria-label="Select black"
                aria-pressed={color === "BLACK"}
                onClick={() => onSelectColor("BLACK")}
                className={cn("studio-colour-dot", color === "BLACK" ? "studio-colour-dot-active" : "")}
              >
                <span className="studio-colour-dot-core studio-colour-dot-core-black" />
              </button>
              <button
                type="button"
                aria-label="Select white"
                aria-pressed={color !== "BLACK"}
                onClick={() => onSelectColor("WHITE")}
                className={cn("studio-colour-dot studio-colour-dot-white", color !== "BLACK" ? "studio-colour-dot-active" : "")}
              >
                <span className="studio-colour-dot-core studio-colour-dot-core-white" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onAddArtworkClick}
            className="studio-bespoke-upload-button"
          >
            Upload Artwork
          </button>

          {activeArtworkAsset ? (
            <div className="studio-artwork-tools">
              <div className="studio-bespoke-label">Size</div>
              <div className="studio-artwork-transform-controls">
                <button
                  type="button"
                  onClick={onZoomOut}
                  aria-label="Zoom artwork out"
                  className="studio-artwork-zoom-button"
                >
                  -
                </button>
                <input
                  type="range"
                  min={scaleBounds.min}
                  max={scaleBounds.max}
                  step="0.05"
                  value={artworkTransform.scale}
                  onChange={onArtworkScaleChange}
                  aria-label="Artwork zoom"
                />
                <button
                  type="button"
                  onClick={onZoomIn}
                  aria-label="Zoom artwork in"
                  className="studio-artwork-zoom-button"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={onResetArtworkTransform}
                  className="studio-artwork-reset-button"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setCropping(true)}
                  disabled={!artworkUrl}
                  className="studio-artwork-reset-button"
                  aria-label="Crop artwork"
                >
                  Crop
                </button>
              </div>
            </div>
          ) : null}

          {artworkUrl && artworkKind ? (
            <p
              className={cn("studio-artwork-kind", artworkKind.whiteBackground ? "studio-artwork-kind-warn" : "")}
              role="note"
            >
              {artworkKindNotice(artworkKind)}
            </p>
          ) : null}

          <div className="studio-bespoke-uploads">
            <div className="studio-bespoke-label">Your Uploads</div>

            <div className="studio-upload-grid">
              {/* One panel: an upload that is on the shirt says where (and can be taken off again); artwork on the
                  shirt that has no tile of its own (a cropped copy) gets a tile here too. */}
              {orphanLayers.map((layer) => (
                <div key={`layer-${layer.placement}`} className="studio-upload-tile">
                  <button
                    type="button"
                    onClick={() => onSelectLayer(layer.placement)}
                    className={cn("studio-upload-slot", layer.placement === activePlacement ? "border-black border-[1.5px]" : "")}
                    style={{ padding: 0, overflow: "hidden" }}
                    aria-label={`Edit artwork on ${placementLabelOf(layer.placement)}`}
                  >
                    <img src={layer.url} alt={layer.fileName ?? ""} className="studio-upload-image" />
                  </button>
                  <button
                    type="button"
                    className="studio-upload-onshirt"
                    onClick={() => onRemoveLayer(layer.placement)}
                    aria-label={`Remove artwork from ${placementLabelOf(layer.placement)}`}
                  >
                    {placementLabelOf(layer.placement)} ×
                  </button>
                </div>
              ))}
              {visibleAssets.length ? (
                visibleAssets.map((asset) => {
                  const onShirtLayer = layers.find((layer) => layer.url === asset.url) ?? null;
                  const isCurrentActive =
                    (onShirtLayer ? onShirtLayer.placement === activePlacement : false) ||
                    selectedPrimaryAssetId === asset.id ||
                    artworkUrl === asset.url ||
                    stagedAsset?.id === asset.id ||
                    cropOriginal?.id === asset.id;
                  const isRemoving = removingAssetId === asset.id;
                  const isConfirming = confirmingRemoveId === asset.id;
                  // Select and remove are sibling buttons (a button can't
                  // contain another button); the wrapper carries the tile's
                  // position so the × can sit on its corner.
                  return (
                    <div key={asset.id} className="studio-upload-tile">
                      <button
                        type="button"
                        onClick={() => (onShirtLayer ? onSelectLayer(onShirtLayer.placement) : onSelectAsset(asset))}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        title="Click to use, or drag onto the shirt"
                        className={cn(
                          "studio-upload-slot",
                          isCurrentActive ? "border-black border-[1.5px]" : ""
                        )}
                        style={{ padding: 0, overflow: "hidden" }}
                        disabled={attachingAssetId === asset.id || isRemoving}
                      >
                        <img
                          src={asset.url}
                          alt={asset.fileName}
                          className="studio-upload-image"
                          onError={() => onBrokenArtwork(asset.url)}
                        />
                      </button>
                      {onShirtLayer ? (
                        <button
                          type="button"
                          className="studio-upload-onshirt"
                          onClick={() => onRemoveLayer(onShirtLayer.placement)}
                          aria-label={`Remove artwork from ${placementLabelOf(onShirtLayer.placement)}`}
                        >
                          {placementLabelOf(onShirtLayer.placement)} ×
                        </button>
                      ) : null}
                      {isConfirming ? (
                        <div
                          className="studio-upload-confirm"
                          role="alertdialog"
                          aria-label={`Remove ${asset.fileName}?`}
                        >
                          {/* Long and short labels: CSS picks one by the tile's
                              own width (~80px phone tiles get the compact
                              "Remove?" + icon buttons). */}
                          <p className="studio-upload-confirm-text">
                            <span className="studio-upload-confirm-long">Remove this upload?</span>
                            <span className="studio-upload-confirm-short" aria-hidden="true">Remove?</span>
                          </p>
                          <div className="studio-upload-confirm-actions">
                            <button
                              type="button"
                              className="studio-upload-confirm-cancel"
                              onClick={() => setConfirmingRemoveId(null)}
                              aria-label="Cancel"
                              autoFocus
                            >
                              <span className="studio-upload-confirm-long">Cancel</span>
                              <span className="studio-upload-confirm-short" aria-hidden="true">✕</span>
                            </button>
                            <button
                              type="button"
                              className="studio-upload-confirm-remove"
                              onClick={() => {
                                setConfirmingRemoveId(null);
                                onRemoveAsset(asset);
                              }}
                              aria-label="Remove"
                            >
                              <span className="studio-upload-confirm-long">Remove</span>
                              <span className="studio-upload-confirm-short" aria-hidden="true">✓</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingRemoveId(asset.id)}
                          disabled={isRemoving}
                          className="studio-upload-remove"
                          aria-label={`Remove ${asset.fileName}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })
              ) : null}
              {/* Empty upload slots (dashed, upload icon) fill the grid up to
                  four, as in the frame; each one opens the file picker. */}
              {Array.from({ length: Math.max(0, EMPTY_UPLOAD_SLOTS - visibleAssets.length - orphanLayers.length) }, (_, index) => (
                <button
                  key={`empty-${index}`}
                  type="button"
                  onClick={onAddArtworkClick}
                  className="studio-upload-empty-slot"
                  aria-label="Upload artwork"
                >
                  <UploadFileIcon />
                </button>
              ))}
            </div>
          </div>


          {mockupError ? <div className="studio-bespoke-error">{mockupError}</div> : null}
        </div>

        <div className="studio-bespoke-controls-footer">
          {/* Generates the AI mockup when needed, saves, then closes --
              see saveBespokeTShirt in BuilderClient.tsx. */}
          <button
            type="button"
            onClick={onSaveTShirt}
            disabled={mockupPending || savePending}
            aria-busy={mockupPending || savePending}
            className="studio-bespoke-save-button disabled:cursor-wait disabled:opacity-70"
          >
            {mockupPending ? "Generating..." : savePending ? "Saving..." : "Save T-Shirt"}
          </button>
        </div>
        </div>
        </div>
        {/* Crop mode takes over the popup's canvas and controls in place. */}
        {cropping && artworkUrl ? (
          <ArtworkCropper
            originalUrl={cropOriginal?.url ?? artworkUrl}
            fileName={(cropOriginal ?? activeArtworkAsset)?.fileName ?? "artwork.png"}
            initial={cropOriginal ? activeArtworkAsset?.crop ?? null : null}
            onCancel={() => setCropping(false)}
            onApply={async (result) => {
              await onCropArtwork(result, cropOriginal ?? activeArtworkAsset);
              setCropping(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
