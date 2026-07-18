type ArtworkModalProps = {
  onClose: () => void;
  onContinueCustomRequest: () => void;
};

export default function ArtworkModal({
  onClose,
  onContinueCustomRequest,
}: ArtworkModalProps) {
  return (
    <div className="studio-modal-overlay">
      <div className="studio-custom-request-modal studio-modal-panel">
        <button
          type="button"
          onClick={onClose}
          className="studio-modal-close"
          aria-label="Close custom garment request"
        >
          ×
        </button>

        <div className="studio-modal-kicker">TGFM Bespoke</div>

        <h2 className="studio-custom-request-title">Custom Garment Request</h2>

        <p className="studio-custom-request-copy">
          Custom garment constructions are not available for instant checkout.
          We&apos;ll review your request and provide a tailored quote based on
          your customization needs.
        </p>

        <button
          type="button"
          onClick={onContinueCustomRequest}
          className="studio-modal-primary-button"
        >
          Continue With Custom Request
        </button>

        <button
          type="button"
          onClick={onClose}
          className="studio-modal-secondary-button"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
