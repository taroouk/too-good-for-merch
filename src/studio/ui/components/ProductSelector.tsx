import type { ProductType } from "@prisma/client";

type ProductSelectorProps = {
  product: ProductType | null;
  onSelectFitted: () => void;
  onSelectOversized: () => void;
  onRequestCustom: () => void;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ProductSelector({
  product,
  onSelectFitted,
  onSelectOversized,
  onRequestCustom,
}: ProductSelectorProps) {
  return (
    <div className="studio-control-group">
      <div className="studio-control-heading">
        <div>
          <div className="studio-eyebrow">Product Type</div>
          <div className="studio-control-caption">
            Select the silhouette.
          </div>
        </div>

        <span className="studio-step-number">01</span>
      </div>

      <div className="studio-product-list">
        <button
          type="button"
          onClick={onSelectFitted}
          className={cn(
            "studio-product-button",
            product === "FITTED"
              ? "studio-product-button-active"
              : "studio-product-button-idle",
          )}
        >
          <span>Fitted T-Shirt</span>
          <span className="studio-product-meta">Classic</span>
        </button>

        <button
          type="button"
          onClick={onSelectOversized}
          className={cn(
            "studio-product-button",
            product === "OVERSIZED"
              ? "studio-product-button-active"
              : "studio-product-button-idle",
          )}
        >
          <span>Oversized T-Shirt</span>
          <span className="studio-product-meta">Relaxed</span>
        </button>

        <button
          type="button"
          onClick={onRequestCustom}
          className={cn(
            "studio-product-button",
            product === "CUSTOM"
              ? "studio-product-button-active"
              : "studio-product-button-idle",
          )}
        >
          <span>Bespoke</span>
          <span className="studio-product-meta">Custom</span>
        </button>
      </div>
    </div>
  );
}
