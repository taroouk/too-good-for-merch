import type { ChangeEventHandler, FormEventHandler } from "react";

type PaymentMethod = "CARD" | "WALLET";

type CheckoutModalProps = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  walletEnabled: boolean;
  estimatedTotalText: string;
  checkoutError: string | null;
  isCreatingOrder: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCustomerNameChange: ChangeEventHandler<HTMLInputElement>;
  onCustomerEmailChange: ChangeEventHandler<HTMLInputElement>;
  onCustomerPhoneChange: ChangeEventHandler<HTMLInputElement>;
  onSelectCardPayment: () => void;
  onSelectWalletPayment: () => void;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function CheckoutModal({
  customerName,
  customerEmail,
  customerPhone,
  paymentMethod,
  walletEnabled,
  estimatedTotalText,
  checkoutError,
  isCreatingOrder,
  onClose,
  onSubmit,
  onCustomerNameChange,
  onCustomerEmailChange,
  onCustomerPhoneChange,
  onSelectCardPayment,
  onSelectWalletPayment,
}: CheckoutModalProps) {
  return (
    <div className="studio-modal-overlay">
      <div className="relative w-[min(92vw,540px)] rounded-[28px] bg-white p-6 text-black shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-4 text-3xl leading-none text-black/40 hover:text-black"
          aria-label="Close checkout"
        >
          ×
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">Secure checkout</p>
        <h2 className="mt-2 text-3xl font-semibold">Complete your order</h2>
        <p className="mt-2 text-sm leading-6 text-black/55">
          Your final total is calculated on our server. Card details are entered securely on Paymob.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Full name
            <input
              value={customerName}
              onChange={onCustomerNameChange}
              autoComplete="name"
              required
              minLength={2}
              className="mt-2 h-12 w-full rounded-xl border border-black/15 px-4 outline-none focus:border-black"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Email
              <input
                value={customerEmail}
                onChange={onCustomerEmailChange}
                type="email"
                autoComplete="email"
                required
                className="mt-2 h-12 w-full rounded-xl border border-black/15 px-4 outline-none focus:border-black"
              />
            </label>
            <label className="block text-sm font-medium">
              Phone
              <input
                value={customerPhone}
                onChange={onCustomerPhoneChange}
                type="tel"
                autoComplete="tel"
                placeholder="+20 10 0000 0000"
                required
                className="mt-2 h-12 w-full rounded-xl border border-black/15 px-4 outline-none focus:border-black"
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Payment method</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-4", paymentMethod === "CARD" ? "border-black bg-black text-white" : "border-black/15")}>
                <input type="radio" name="paymentMethod" value="CARD" checked={paymentMethod === "CARD"} onChange={onSelectCardPayment} />
                <span className="font-semibold">Credit / debit card</span>
              </label>
              {walletEnabled ? (
                <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-4", paymentMethod === "WALLET" ? "border-black bg-black text-white" : "border-black/15")}>
                  <input type="radio" name="paymentMethod" value="WALLET" checked={paymentMethod === "WALLET"} onChange={onSelectWalletPayment} />
                  <span className="font-semibold">Mobile wallet</span>
                </label>
              ) : null}
            </div>
          </fieldset>

          <div className="flex items-center justify-between rounded-xl bg-[#f5f3ef] p-4">
            <span className="text-sm text-black/55">Estimated total</span>
            <strong className="text-lg">{estimatedTotalText}</strong>
          </div>
          {checkoutError ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{checkoutError}</div> : null}
          <button
            type="submit"
            disabled={isCreatingOrder}
            className="h-13 w-full rounded-xl bg-black px-5 py-3.5 font-semibold text-white disabled:cursor-wait disabled:opacity-60"
          >
            {isCreatingOrder ? "Connecting to Paymob…" : "Continue to secure payment"}
          </button>
        </form>
      </div>
    </div>
  );
}
