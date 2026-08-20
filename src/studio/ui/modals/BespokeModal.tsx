/* eslint-disable @next/next/no-img-element */
import type {
  CSSProperties,
  ChangeEventHandler,
  PointerEventHandler,
} from "react";
import type { GarmentColor } from "@prisma/client";

import type { PlacementKey } from "src/pricing/placements";

type ArtworkTransform = {
  x: number;
  y: number;
  scale: number;
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
  return (
    <div className="studio-modal-overlay studio-modal-overlay-soft">
      <div className="studio-bespoke-modal studio-modal-panel">
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
          <div ref={previewRef} className="studio-bespoke-canvas" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
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

            {artworkUrl && (!generatedMockupUrl || isMockupStale) ? (
              <img
                src={artworkUrl}
                alt="Artwork preview"
                className="studio-bespoke-artwork studio-bespoke-artwork-draggable"
                style={{
                  position: "absolute",
                  zIndex: 40,
                  mixBlendMode: color === "WHITE" ? "multiply" : "normal",
                  opacity: color === "WHITE" ? 0.95 : 1,
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
          <div>
            <div className="studio-bespoke-kicker">Custom Artwork</div>
            <h2 className="studio-bespoke-title">Build Your T-Shirt</h2>
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
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min="0.4"
                    max="2.4"
                    step="0.05"
                    value={artworkTransform.scale}
                    onChange={onArtworkScaleChange}
                    aria-label="Artwork zoom"
                  />
                  <button
                    type="button"
                    onClick={onZoomIn}
                    aria-label="Zoom artwork in"
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
  );
}
