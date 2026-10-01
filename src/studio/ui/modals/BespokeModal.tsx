/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
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
import { getPlacementSide } from "src/studio/render/placement-config";
import { getEditorAspectRatio } from "src/studio/render/editor-surface";
import { previewArtworkBlend } from "src/studio/render/preview-blend";
import { shouldMountArtworkOverlay } from "src/studio/artwork-overlay-visibility";
import { useEscapeToClose } from "src/studio/ui/modals/useEscapeToClose";
import { isBackdropClick } from "src/studio/ui/modals/modal-a11y";
import { useModalDialog } from "src/studio/ui/modals/useModalDialog";
import { useImageAspectRatio } from "src/studio/ui/useImageAspectRatio";

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
  onRemoveSelectedArtwork: () => void;
  onAddArtworkClick: () => void;
  onZoomOut: () => void;
  onArtworkScaleChange: ChangeEventHandler<HTMLInputElement>;
  onZoomIn: () => void;
  onResetArtworkTransform: () => void;
  onSelectAsset: (asset: UserAssetDTO) => void;
  onRemoveAsset: (asset: UserAssetDTO) => void;
  removingAssetId: string | null;
  onSaveTShirt: () => void;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function BespokeModal({
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
  onRemoveSelectedArtwork,
  onAddArtworkClick,
  onZoomOut,
  onArtworkScaleChange,
  onZoomIn,
  onResetArtworkTransform,
  onSelectAsset,
  onRemoveAsset,
  removingAssetId,
  onSaveTShirt,
}: BespokeModalProps) {
  // The upload whose × was pressed: its tile shows an inline "Remove this
  // upload?" prompt instead of a browser confirm() dialog.
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  // Escape first dismisses an open remove prompt, then closes the popup.
  useEscapeToClose(() => {
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
          <div ref={previewRef} className="studio-bespoke-canvas" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", aspectRatio: previewAspectRatio }}>
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

            {/* No artwork selected yet: show the Figma placeholder in the
                selected placement's box (same box the artwork would use),
                so the customer sees where their design will go. Purely
                decorative -- not draggable, ignored by screen readers. */}
            {!artworkUrl ? (
              <img
                src="/images/artwork-placeholder.png"
                alt=""
                aria-hidden="true"
                className="studio-bespoke-artwork-placeholder"
                draggable={false}
                style={{
                  position: "absolute",
                  zIndex: 30,
                  objectFit: "contain",
                  pointerEvents: "none",
                  ...bespokeArtworkStyle,
                }}
              />
            ) : null}

            {artworkUrl && shouldMountArtworkOverlay({ artworkUrl }) ? (
              <img
                src={overlayArtworkUrl ?? artworkUrl}
                alt="Artwork preview"
                className="studio-bespoke-artwork studio-bespoke-artwork-draggable"
                style={{
                  position: "absolute",
                  zIndex: 40,
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
                  const isRemoving = removingAssetId === asset.id;
                  const isConfirming = confirmingRemoveId === asset.id;
                  // Select and remove are sibling buttons (a button can't
                  // contain another button); the wrapper carries the tile's
                  // position so the × can sit on its corner.
                  return (
                    <div key={asset.id} className="studio-upload-tile">
                      <button
                        type="button"
                        onClick={() => onSelectAsset(asset)}
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
                        />
                      </button>
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
              ) : (
                <div className="studio-upload-empty">No uploads yet</div>
              )}
            </div>
          </div>
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
      </div>
    </div>
  );
}
