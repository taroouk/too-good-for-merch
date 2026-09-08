/* eslint-disable @next/next/no-img-element */
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
import { getPlacementSide, getTemplateAspectRatio } from "src/studio/render/placement-config";
import { previewArtworkBlend } from "src/studio/render/preview-blend";
import {
  artworkOverlayOpacity,
  shouldMountArtworkOverlay,
} from "src/studio/artwork-overlay-visibility";
import { useEscapeToClose } from "src/studio/ui/modals/useEscapeToClose";
import { isBackdropClick } from "src/studio/ui/modals/modal-a11y";
import { useModalDialog } from "src/studio/ui/modals/useModalDialog";

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
};

type PlacementCard = {
  key: PlacementKey;
  label: string;
  image: string;
};

type BespokeModalProps = {
  generatedMockupUrl: string | null;
  bespokeShirtSrc: string;
  artworkUrl: string | null;
  // Trim-to-visible-content version of artworkUrl, used ONLY for the
  // overlay <img src> below -- see BuilderClient's useTrimmedArtworkUrl
  // usage. artworkUrl itself must stay untrimmed since it's also used for
  // asset-grid identity comparisons elsewhere in this component. Optional
  // + falls back to artworkUrl so this stays backwards compatible.
  overlayArtworkUrl?: string | null;
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
  canGenerateMockup: boolean;
  shouldShowGenerateButton: boolean;
  isMockupStale: boolean;
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
  onRemoveSelectedArtwork: () => void;
  onAddArtworkClick: () => void;
  onZoomOut: () => void;
  onArtworkScaleChange: ChangeEventHandler<HTMLInputElement>;
  onZoomIn: () => void;
  onResetArtworkTransform: () => void;
  onGenerateMockup: () => void;
  onSelectAsset: (asset: UserAssetDTO) => void;
  onSaveTShirt: () => void;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function BespokeModal({
  generatedMockupUrl,
  bespokeShirtSrc,
  artworkUrl,
  overlayArtworkUrl,
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
  canGenerateMockup,
  shouldShowGenerateButton,
  isMockupStale,
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
  onRemoveSelectedArtwork,
  onAddArtworkClick,
  onZoomOut,
  onArtworkScaleChange,
  onZoomIn,
  onResetArtworkTransform,
  onGenerateMockup,
  onSelectAsset,
  onSaveTShirt,
}: BespokeModalProps) {
  useEscapeToClose(onClose);

  // Front templates are true 1:1 squares; back templates are a 1024x1536
  // (2:3) portrait -- see getTemplateAspectRatio's own comment for the real
  // measured dimensions. The canvas below used to be hardcoded to
  // aspect-ratio 1/1 in globals.css for both sides, which silently
  // pillarboxed the real back photo (object-fit: contain) and threw off
  // the artwork overlay's percentage-based position, computed against the
  // CONTAINER, not the image's actual displayed rectangle.
  const previewAspectRatio = getTemplateAspectRatio(getPlacementSide(activePlacement));

  // Same per-placement ceiling the server's resolvePlacement already
  // enforces (getEffectiveScaleBounds) -- not a second, independently
  // guessed range. Defaults mirror BuilderClient's own state defaults so
  // this never diverges from what the parent actually resolved.
  const scaleBounds = getEffectiveScaleBounds(product ?? "FITTED", color ?? "WHITE", activePlacement);

  const panelRef = useModalDialog<HTMLDivElement>(true);

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
          {isMockupStale && generatedMockupUrl ? (
            <div className="studio-bespoke-stale-badge">
              Preview changed — AI mockup is outdated.
            </div>
          ) : null}
          <div ref={previewRef} className="studio-bespoke-canvas" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", aspectRatio: previewAspectRatio }}>
           {generatedMockupUrl && !isMockupStale ? (
             <img
               src={generatedMockupUrl}
               alt="AI mockup preview"
               className="studio-bespoke-shirt"
               style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain" }}
             />
           ) : (
             <img
               src={bespokeShirtSrc}
               alt="T-shirt preview"
               className="studio-bespoke-shirt"
               style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain" }}
             />
           )}

            {artworkUrl && shouldMountArtworkOverlay({ artworkUrl }) ? (
              <img
                src={overlayArtworkUrl ?? artworkUrl}
                alt="Artwork preview"
                className="studio-bespoke-artwork studio-bespoke-artwork-draggable"
                style={{
                  position: "absolute",
                  zIndex: 40,
                  // Kept mounted at all times (not conditionally removed
                  // from the DOM) so onArtworkPointerDown is always
                  // reachable -- a fresh, non-stale generated mockup only
                  // hides it visually. Previously this <img> was removed
                  // from the DOM entirely whenever !isMockupStale, which
                  // meant there was no way to ever start a drag again:
                  // dragging is the only thing that invalidates the
                  // mockup (via discardMockups in updateArtworkTransform),
                  // but dragging requires this element to already exist.
                  // See src/studio/artwork-overlay-visibility.ts for the
                  // extracted, unit-tested mount/opacity logic.
                  //
                  // previewArtworkBlend/bespokeArtworkStyle both set their
                  // own `opacity` (blend's is always 1; style's tracks the
                  // artwork's own alpha), so the visibility override must
                  // spread LAST or one of theirs silently wins.
                  ...previewArtworkBlend(color),
                  ...bespokeArtworkStyle,
                  transform: bespokeArtworkTransform,
                  opacity: artworkOverlayOpacity({ generatedMockupUrl, isMockupStale }),
                }}
                draggable={false}
                onPointerDown={onArtworkPointerDown}
                onPointerMove={onArtworkPointerMove}
                onPointerUp={onArtworkPointerUp}
                onPointerCancel={onArtworkPointerUp}
              />
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
          <div>
            <div className="studio-bespoke-kicker">Custom Artwork</div>
            <h2 id="bespoke-modal-title" className="studio-bespoke-title">Build Your T-Shirt</h2>
          </div>

          <div className="studio-selected-artwork-area">
            <div className="studio-bespoke-label">Selected Artwork</div>

            <div className="studio-selected-artwork-grid">
              {activeArtworkAsset ? (
                <div className="studio-selected-artwork-card">
                  <button
                    type="button"
                    onClick={onRemoveSelectedArtwork}
                    className="studio-selected-artwork-remove"
                    aria-label="Remove selected artwork"
                  >
                    ×
                  </button>

                  <img
                    src={activeArtworkAsset.url}
                    alt={activeArtworkAsset.fileName}
                    className="studio-selected-artwork-image"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onAddArtworkClick}
                  className="studio-selected-artwork-add"
                >
                  + Add
                </button>
              )}
            </div>

            {activeArtworkAsset ? (
              <div className="studio-artwork-tools">
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
                </div>

                <div className="studio-nanobanana-actions">
                  {shouldShowGenerateButton ? (
                    <button
                      type="button"
                      onClick={onGenerateMockup}
                      disabled={mockupPending || !canGenerateMockup}
                      className="studio-nanobanana-button"
                    >
                      {mockupPending ? "Generating..." : "Generate AI Mockup"}
                    </button>
                  ) : null}
                </div>

                {mockupError ? (
                  <div className="studio-bespoke-error">{mockupError}</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onAddArtworkClick}
            className="studio-bespoke-upload-button"
          >
            Upload Artwork
          </button>

          <div>
            <div className="studio-bespoke-label">Your Uploads</div>

            <div className="studio-upload-grid">
              {userAssets.length ? (
                userAssets.map((asset) => {
                  const isCurrentActive = selectedPrimaryAssetId === asset.id || artworkUrl === asset.url;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => onSelectAsset(asset)}
                      className={cn(
                        "studio-upload-slot",
                        isCurrentActive ? "border-black border-[1.5px]" : ""
                      )}
                      style={{ padding: 0, overflow: "hidden" }}
                      disabled={attachingAssetId === asset.id}
                    >
                      <img
                        src={asset.url}
                        alt={asset.fileName}
                        className="studio-upload-image"
                      />
                    </button>
                  );
                })
              ) : (
                <div className="studio-upload-empty">No uploads yet</div>
              )}
            </div>
          </div>
        </div>

        <div className="studio-bespoke-controls-footer">
          <button
            type="button"
            onClick={onSaveTShirt}
            className="studio-bespoke-save-button"
          >
            Save T-Shirt
          </button>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}
