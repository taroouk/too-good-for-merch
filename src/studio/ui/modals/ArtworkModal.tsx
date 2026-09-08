import { useEscapeToClose } from "src/studio/ui/modals/useEscapeToClose";
import { isBackdropClick } from "src/studio/ui/modals/modal-a11y";
import { useModalDialog } from "src/studio/ui/modals/useModalDialog";

type ArtworkModalProps = {
  onClose: () => void;
  onContinueCustomRequest: () => void;
};

export default function ArtworkModal({
  onClose,
  onContinueCustomRequest,
}: ArtworkModalProps) {
  useEscapeToClose(onClose);
  const panelRef = useModalDialog<HTMLDivElement>(true);

  return (
    <div
      className="studio-modal-overlay"
      onClick={(event) => {
        if (isBackdropClick(event.target, event.currentTarget)) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="studio-custom-request-modal studio-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="artwork-modal-title"
        tabIndex={-1}
      >
        <button
          type="button"
          onClick={onClose}
          className="studio-modal-close"
          aria-label="Close custom garment request"
        >
          ×
        </button>

        <div className="studio-modal-scroll">
          <div className="studio-modal-kicker">TGFM Bespoke</div>

          <h2 id="artwork-modal-title" className="studio-custom-request-title">Custom Garment Request</h2>

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
    </div>
  );
}
