type CheckoutButtonProps = {
  disabled: boolean;
  onCheckout: () => void;
};

export default function CheckoutButton({
  disabled,
  onCheckout,
}: CheckoutButtonProps) {
  return (
    <button
      onClick={onCheckout}
      disabled={disabled}
      className="
    studio-add-button
  "
    >
      <span className="flex items-center justify-center gap-2">
        Checkout
        <span className="transition-transform duration-300 group-hover:translate-x-1">
          →
        </span>
      </span>

      {/* underline animation */}
      <span className="absolute bottom-0 left-0 h-[1px] w-0 bg-black transition-all duration-300 hover:w-full" />
    </button>
  );
}
