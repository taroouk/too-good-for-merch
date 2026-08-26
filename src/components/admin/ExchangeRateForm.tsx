"use client";

import { useRef } from "react";
import { buttonClass } from "src/components/admin/ui/Button";

// Confirmation only gates a genuine rate change (a financially significant,
// forward-only edit per src/lib/orders/checkout.ts) -- never blocks saving
// the unrelated store fields carried along as hidden inputs below.
export default function ExchangeRateForm({
  action,
  currentRate,
  storeName,
  currency,
  taxRate,
  shipping,
}: {
  action: (formData: FormData) => void | Promise<void>;
  currentRate: number | null;
  storeName: string;
  currency: string;
  taxRate: number;
  shipping: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const raw = inputRef.current?.value.trim() ?? "";
    const nextRate = raw === "" ? null : Number(raw);
    const changed = nextRate !== currentRate;
    if (!changed) return;

    const label = (rate: number | null) => (rate ? `1 USD = ${rate} EGP` : "not configured");
    const confirmed = window.confirm(
      `Change the USD → EGP exchange rate?\n\n` +
        `Current rate: ${label(currentRate)}\n` +
        `New rate: ${label(nextRate)}\n\n` +
        `This affects the payment amount of future orders only. Existing orders keep their original exchange rate.`,
    );
    if (!confirmed) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="mt-6 space-y-4">
      <input type="hidden" name="storeName" value={storeName} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="taxRate" value={taxRate} />
      <input type="hidden" name="shipping" value={shipping} />
      <label className="block text-sm font-medium text-admin-ink">
        USD → EGP exchange rate
        <div className="mt-2 flex items-center gap-2">
          <span className="whitespace-nowrap text-sm text-admin-muted">1 USD =</span>
          <input
            ref={inputRef}
            name="usdToEgpRate"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={currentRate ?? ""}
            placeholder="e.g. 50.00"
            className="h-11 w-full rounded-xl border border-admin-border-strong px-4 text-admin-ink outline-none focus:border-admin-ink"
          />
          <span className="whitespace-nowrap text-sm text-admin-muted">EGP</span>
        </div>
      </label>
      <p className="text-xs leading-5 text-admin-muted">
        Used to convert the final USD order price into EGP for Paymob payments. Changing this affects future
        checkouts only — existing orders keep their original exchange rate.
      </p>
      <button className={buttonClass({ className: "w-full" })}>Save changes</button>
    </form>
  );
}
