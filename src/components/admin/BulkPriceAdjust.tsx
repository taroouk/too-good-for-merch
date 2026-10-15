"use client";

import { useMemo, useState } from "react";
import { buttonClass } from "src/components/admin/ui/Button";
import { adjustPrice, validateBulkAdjustment, type BulkMode } from "src/lib/admin/bulk-pricing";
import { formatDisplayPrice, type StoreDisplay } from "src/pricing/display";

type Row = { product: string; fabric: string; label: string; detail: string; unitPrice: number };

const fieldClass = "h-11 w-full rounded-xl border border-admin-border-strong bg-white px-3 text-sm outline-none focus:border-admin-ink";

// "Adjust all prices": pick a scope and a change, see exactly what every price
// becomes (in USD and in the currency customers see), then confirm.
export default function BulkPriceAdjust({
  action,
  rows,
  placementRows,
  products,
  fabrics,
  display,
}: {
  action: (formData: FormData) => void | Promise<void>;
  rows: Row[];
  placementRows: Row[];
  products: string[];
  fabrics: string[];
  display: StoreDisplay;
}) {
  const [mode, setMode] = useState<BulkMode>("percent");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [rawAmount, setRawAmount] = useState("");
  const [product, setProduct] = useState("");
  const [fabric, setFabric] = useState("");
  const [includePlacements, setIncludePlacements] = useState(false);

  const magnitude = Number(rawAmount);
  const amount = direction === "down" ? -Math.abs(magnitude) : Math.abs(magnitude);
  const problem = rawAmount.trim() === "" ? null : validateBulkAdjustment(mode, amount);
  const ready = rawAmount.trim() !== "" && problem === null;

  const preview = useMemo(() => {
    const scoped = rows.filter((row) => (!product || row.product === product) && (!fabric || row.fabric === fabric));
    const all = [...scoped, ...(includePlacements ? placementRows.filter((row) => row.unitPrice > 0) : [])];
    return all.map((row) => ({ ...row, next: ready ? adjustPrice(row.unitPrice, mode, amount) : row.unitPrice }));
  }, [rows, placementRows, product, fabric, includePlacements, mode, amount, ready]);

  const changed = preview.filter((row) => row.next !== row.unitPrice).length;
  const shown = preview;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!ready || changed === 0) {
      event.preventDefault();
      return;
    }
    const sign = amount > 0 ? "+" : "−";
    const label = mode === "percent" ? `${sign}${Math.abs(amount)}%` : `${sign}${Math.abs(amount)} USD`;
    if (!window.confirm(`Change ${changed} price${changed === 1 ? "" : "s"} by ${label}?\n\nThis applies to new quotes and orders straight away. Existing orders are not affected.`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="amount" value={ready ? String(amount) : ""} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto_150px]">
        <label className="text-xs font-semibold uppercase tracking-wide text-admin-faint">
          Product
          <select name="product" value={product} onChange={(e) => setProduct(e.target.value)} className={`${fieldClass} mt-1.5 text-sm font-normal normal-case tracking-normal text-admin-ink`}>
            <option value="">All products</option>
            {products.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-admin-faint">
          Fabric
          <select name="fabric" value={fabric} onChange={(e) => setFabric(e.target.value)} className={`${fieldClass} mt-1.5 text-sm font-normal normal-case tracking-normal text-admin-ink`}>
            <option value="">All fabrics</option>
            {fabrics.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-admin-faint">Change by</p>
          <div className="mt-1.5 flex overflow-hidden rounded-xl border border-admin-border-strong text-sm font-semibold" role="group" aria-label="Change type">
            {(["percent", "fixed"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`h-11 px-5 ${mode === m ? "bg-admin-ink text-white" : "bg-white text-admin-muted"}`}>
                {m === "percent" ? "%" : "USD"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-admin-faint">Direction</p>
          <div className="mt-1.5 flex overflow-hidden rounded-xl border border-admin-border-strong text-sm font-semibold" role="group" aria-label="Direction">
            {(["up", "down"] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDirection(d)} aria-pressed={direction === d} className={`h-11 px-4 ${direction === d ? "bg-admin-ink text-white" : "bg-white text-admin-muted"}`}>
                {d === "up" ? "Increase" : "Decrease"}
              </button>
            ))}
          </div>
        </div>
        <label className="text-xs font-semibold uppercase tracking-wide text-admin-faint">
          Amount
          <input
            type="number"
            step="0.01"
            min="0"
            value={rawAmount}
            onChange={(e) => setRawAmount(e.target.value)}
            placeholder={mode === "percent" ? "e.g. 10" : "e.g. 0.50"}
            aria-label="Amount"
            className={`${fieldClass} mt-1.5 text-sm font-normal tracking-normal text-admin-ink`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-sm text-admin-muted">
          <input type="checkbox" name="includePlacements" checked={includePlacements} onChange={(e) => setIncludePlacements(e.target.checked)} />
          Also change the print-position prices
        </label>
        <div className="flex items-center gap-4">
          {problem ? <p role="alert" className="text-sm text-red-600">{problem}</p> : null}
          <button type="submit" disabled={!ready || changed === 0} className={buttonClass({ className: "h-11 px-6" })}>
            Apply to {changed} price{changed === 1 ? "" : "s"}
          </button>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-admin-border">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-admin-canvas px-4 py-3 text-xs font-semibold uppercase tracking-wide text-admin-faint">
          <span>Preview · {preview.length} price{preview.length === 1 ? "" : "s"}</span>
          <span className={ready ? "text-admin-ink" : ""}>{ready ? `${changed} will change` : "Enter an amount to preview"}</span>
        </div>
        {shown.length ? (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-admin-faint shadow-[0_1px_0_0_var(--admin-border,#e5e7eb)]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Item</th>
                  <th className="px-4 py-2.5 font-semibold">Range</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Now (USD)</th>
                  <th className="px-4 py-2.5 text-right font-semibold">New (USD)</th>
                  {display.currency !== "USD" ? <th className="px-4 py-2.5 text-right font-semibold">Customers see</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border">
                {shown.map((row, index) => {
                  const moved = ready && row.next !== row.unitPrice;
                  return (
                    <tr key={`${row.label}-${row.detail}-${index}`}>
                      <td className="px-4 py-3 font-medium text-admin-ink">{row.label}</td>
                      <td className="px-4 py-3 text-admin-muted">{row.detail}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-admin-muted">{row.unitPrice.toFixed(2)}</td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${moved ? (row.next > row.unitPrice ? "text-emerald-700" : "text-red-600") : "text-admin-ink"}`}>{row.next.toFixed(2)}</td>
                      {display.currency !== "USD" ? <td className="px-4 py-3 text-right tabular-nums text-admin-faint">{formatDisplayPrice(row.next, display)}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-4 text-sm text-admin-faint">No prices match that selection.</p>
        )}
      </div>
    </form>
  );
}
