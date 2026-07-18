type PriceCardProps = {
  priceText: string;
};

export default function PriceCard({ priceText }: PriceCardProps) {
  return (
    <div className="studio-right-top">
      <div className="studio-price-stack">
        <div className="studio-price">{priceText}</div>
        <div className="studio-shipping-note">
          Incl. VAT. Ships in 3-5 business days.
        </div>
      </div>
    </div>
  );
}
