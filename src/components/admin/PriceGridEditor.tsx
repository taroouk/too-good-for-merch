"use client";

import { useMemo, useState } from "react";
import { buttonClass } from "src/components/admin/ui/Button";
import type { GridColumn } from "src/lib/admin/price-grid";
import { formatDisplayPrice, type StoreDisplay } from "src/pricing/display";

export type GridColumnMeta = { product: string; fabric: string; title: string; subtitle: string; hidden: boolean };

const cellKey = (column: { product: string; fabric: string }, minQty: number) => `${column.product}|${column.fabric}|${minQty}`;

// The price list as one editable grid: every standard quantity range down the
// side, every product/fabric across the top, and in each cell the price a
// customer pays per unit right now. Change as many cells as you like, then
// save once. Cells show where the price comes from: a custom price you set, or
// the built-in default.
export default function PriceGridEditor({
  action,
  returnTo,
  columns,
  meta,
  display,
  compact = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  columns: GridColumn[];
  meta: GridColumnMeta[];
  display: StoreDisplay;
  compact?: boolean;
}) {
  const initial = useMemo(() => {
    const map = new Map<string, string>();
    for (const column of columns) for (const cell of column.cells) map.set(cellKey(column, cell.minQty), cell.price != null ? String(cell.price) : "");
    return map;
  }, [columns]);
  const [values, setValues] = useState<Map<string, string>>(() => new Map(initial));

  const changed = useMemo(() => {
    const out: Array<{ product: string; fabric: string; minQty: number; maxQty: number; price: number | null }> = [];
    for (const column of columns) {
      if (!column.editable) continue;
      for (const cell of column.cells) {
        const key = cellKey(column, cell.minQty);
        const now = (values.get(key) ?? "").trim();
        if (now === (initial.get(key) ?? "")) continue;
        const number = now === "" ? null : Number(now);
        // Typing the default price back means "use the default".
        const price = number != null && cell.defaultPrice != null && number === cell.defaultPrice ? null : number;
        // A default-priced cell that still equals its default isn't a change.
        if (cell.source === "default" && price == null && cell.defaultPrice != null && number === cell.defaultPrice) continue;
        out.push({ product: column.product, fabric: column.fabric, minQty: cell.minQty, maxQty: cell.maxQty, price });
      }
    }
    return out;
  }, [columns, values, initial]);

  const invalid = changed.some((edit) => edit.price != null && (!Number.isFinite(edit.price) || edit.price <= 0));
  const changedKeys = new Set(changed.map((edit) => `${edit.product}|${edit.fabric}|${edit.minQty}`));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!changed.length || invalid) {
      event.preventDefault();
      return;
    }
    if (!window.confirm(`Save ${changed.length} price change${changed.length === 1 ? "" : "s"}?\n\nThey apply to customers straight away. Existing orders keep the price they were placed at.`)) {
      event.preventDefault();
    }
  }

  const rows = columns[0]?.cells ?? [];
  const showConverted = display.currency !== "USD";

  return (
    <form action={action} onSubmit={onSubmit}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="edits" value={JSON.stringify(changed)} />

      <div className={`overflow-auto rounded-xl border border-admin-border ${compact ? "max-h-[420px]" : "max-h-[640px]"}`}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-[88px] border-b border-r sm:min-w-[110px] border-admin-border bg-admin-canvas px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-admin-faint">
                Quantity
              </th>
              {meta.map((column) => (
                <th key={`${column.product}|${column.fabric}`} className="sticky top-0 z-10 min-w-[136px] border-b border-admin-border bg-admin-canvas px-3 py-3 text-left align-bottom sm:min-w-[150px]">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-admin-faint">{column.product}</span>
                  <span className="block text-sm font-semibold text-admin-ink">{column.title}</span>
                  <span className="block text-xs font-normal text-admin-faint">{column.subtitle}{column.hidden ? " · hidden" : ""}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.minQty}>
                <th scope="row" className="sticky left-0 z-10 border-b border-r border-admin-border bg-white px-3 py-2 text-left text-sm font-semibold text-admin-ink">
                  {row.minQty}–{row.maxQty}
                  <span className="block text-[11px] font-normal text-admin-faint">pieces</span>
                </th>
                {columns.map((column) => {
                  const cell = column.cells[rowIndex];
                  const key = cellKey(column, cell.minQty);
                  const value = values.get(key) ?? "";
                  const isChanged = changedKeys.has(key);
                  const number = value.trim() === "" ? null : Number(value);
                  const bad = number != null && (!Number.isFinite(number) || number <= 0);
                  const status = isChanged ? (number == null ? (cell.defaultPrice != null ? "Back to default" : "Not priced") : "Edited") : cell.source === "custom" ? "Custom" : cell.source === "default" ? "Default" : "Not priced";
                  const shown = number != null && Number.isFinite(number) && number > 0 ? number : null;
                  return (
                    <td key={`${column.product}|${column.fabric}`} className={`border-b border-admin-border px-2 py-1.5 align-top ${isChanged ? "bg-amber-50" : ""}`}>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        inputMode="decimal"
                        value={value}
                        disabled={!column.editable}
                        placeholder={cell.defaultPrice != null ? String(cell.defaultPrice) : "—"}
                        aria-label={`${column.product} ${column.fabric} ${cell.minQty}-${cell.maxQty} unit price in USD`}
                        onChange={(event) => setValues((current) => new Map(current).set(key, event.target.value))}
                        className={`h-10 w-full rounded-lg border px-2.5 text-right text-sm tabular-nums outline-none focus:border-admin-ink disabled:bg-admin-canvas disabled:text-admin-faint ${
                          bad ? "border-red-400" : isChanged ? "border-amber-400 bg-white" : "border-admin-border-strong bg-white"
                        } ${cell.source === "default" && !isChanged ? "text-admin-muted" : "font-semibold text-admin-ink"}`}
                      />
                      <div className="mt-1 flex items-center justify-between gap-2 px-0.5 text-[11px]">
                        <span
                          className={
                            status === "Custom" ? "font-semibold text-emerald-700" : status === "Edited" || status === "Back to default" ? "font-semibold text-amber-700" : status === "Not priced" ? "text-red-600" : "text-admin-faint"
                          }
                        >
                          {column.editable ? status : "Custom tiers"}
                        </span>
                        {showConverted && shown != null ? <span className="tabular-nums text-admin-faint">{formatDisplayPrice(shown, display)}</span> : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-admin-faint">
          Prices are per piece in USD. <span className="font-semibold text-emerald-700">Custom</span> = a price you set · <span className="font-semibold text-admin-muted">Default</span> = the built-in price (edit it to override; clear it to go back).
        </p>
        <div className="flex items-center gap-3">
          {invalid ? <span className="text-xs font-semibold text-red-600">Prices must be greater than zero.</span> : null}
          {changed.length ? <span className="text-sm font-semibold text-amber-700">{changed.length} unsaved change{changed.length === 1 ? "" : "s"}</span> : <span className="text-sm text-admin-faint">No changes</span>}
          <button type="button" onClick={() => setValues(new Map(initial))} disabled={!changed.length} className={buttonClass({ variant: "outline", className: "h-10" })}>
            Discard
          </button>
          <button type="submit" disabled={!changed.length || invalid} className={buttonClass({ className: "h-10 px-5" })}>
            Save {changed.length ? changed.length : ""} change{changed.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </form>
  );
}
