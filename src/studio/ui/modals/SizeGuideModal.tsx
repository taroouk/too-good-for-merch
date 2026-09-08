import { useEscapeToClose } from "src/studio/ui/modals/useEscapeToClose";
import { isBackdropClick } from "src/studio/ui/modals/modal-a11y";
import { useModalDialog } from "src/studio/ui/modals/useModalDialog";

type SizeGuideModalProps = {
  modelNote: string;
  whatsappUrl: string;
  onClose: () => void;
};

// Opened by the "Size Guide" control in BuilderClient, which previously had
// no click handler. Reuses the existing custom-request modal styling and
// only restates information the studio already exposes (the size scale, the
// two fits, the model reference) plus a link to the existing support
// channel for exact measurements -- no new layout or invented size chart.
export default function SizeGuideModal({
  modelNote,
  whatsappUrl,
  onClose,
}: SizeGuideModalProps) {
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
        aria-labelledby="size-guide-modal-title"
        tabIndex={-1}
      >
        <button
          type="button"
          onClick={onClose}
          className="studio-modal-close"
          aria-label="Close size guide"
        >
          ×
        </button>

        <div className="studio-modal-scroll">
          <div className="studio-modal-kicker">TGFM Sizing</div>

          <h2 id="size-guide-modal-title" className="studio-custom-request-title">Size Guide</h2>

          <p className="studio-custom-request-copy">
            Sizes run standard unisex S, M, L and XL &mdash; choose your usual
            t-shirt size. Fitted is a closer, true-to-body cut; Oversized is a
            relaxed, boxier cut that sits looser with a longer body.
          </p>

          <p className="studio-custom-request-copy">{modelNote}</p>

          <p className="studio-custom-request-copy">
            For exact garment measurements (chest, body length, sleeve) on a
            specific fit and fabric, message us and we&apos;ll send the full
            spec.
          </p>

          <button
            type="button"
            onClick={() => {
              window.open(whatsappUrl, "_blank", "noopener,noreferrer");
              onClose();
            }}
            className="studio-modal-primary-button"
          >
            Request Measurements
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
