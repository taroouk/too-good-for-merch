import type { ChangeEventHandler } from "react";

type QuantitySelectorProps = {
  quantity: number;
  onDecrease: () => void;
  onQuantityChange: ChangeEventHandler<HTMLInputElement>;
  onIncrease: () => void;
};

export default function QuantitySelector({
  quantity,
  onDecrease,
  onQuantityChange,
  onIncrease,
}: QuantitySelectorProps) {
  return (
    <div className="studio-field-block studio-quantity-block">
      <div className="studio-right-label">Quantity</div>

      <div className="studio-quantity">
        <button
          type="button"
          onClick={onDecrease}
          className="studio-quantity-button"
          aria-label="Decrease quantity"
        >
          -
        </button>

        <input
          type="number"
          min={1}
          max={9999}
          value={quantity}
          onChange={onQuantityChange}
          className="studio-quantity-input"
          aria-label="Quantity"
        />

        <button
          type="button"
          onClick={onIncrease}
          className="studio-quantity-button"
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>
    </div>
  );
}
