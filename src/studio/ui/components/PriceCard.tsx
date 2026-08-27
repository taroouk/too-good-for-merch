type PriceCardProps = {
  priceText: string;
  // Present only when the price shown is the result of a pricing-service
  // failure (not a legitimate "no pricing configured"/"bulk quote" state) --
  // renders a retry affordance instead of the shipping note so a transient
  // failure is recoverable without changing product/fabric/quantity.
  onRetry?: () => void;
};

export default function PriceCard({ priceText, onRetry }: PriceCardProps) {
  return (
    <div className="studio-right-top">
      <div className="studio-price-stack">
        <div className="studio-price">{priceText}</div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="text-left text-xs font-semibold text-red-600 underline underline-offset-2"
          >
            Tap to retry pricing
          </button>
        ) : (
          <div className="studio-shipping-note">
            Incl. VAT. Ships in 3-5 business days.
          </div>
        )}
      </div>
    </div>
  );
}
