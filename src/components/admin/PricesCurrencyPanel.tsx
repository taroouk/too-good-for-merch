import { savePriceGridAction, upsertPlacementPricingRuleAction } from "src/actions/admin-pricing-actions";
import PriceGridEditor from "src/components/admin/PriceGridEditor";
import { getPriceGridData } from "src/lib/admin/price-grid-data";
import { updateDisplayCurrencyAction, updateExchangeRateAction } from "src/actions/admin-system-actions";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import { buttonClass } from "src/components/admin/ui/Button";
import { prisma } from "src/lib/prisma";
import { DISPLAY_CURRENCIES, effectiveDisplay, formatDisplayPrice, parseDisplayCurrency } from "src/pricing/display";
import { CUSTOMER_PLACEMENTS, customerPlacementLabel } from "src/pricing/placements";

const RETURN_TO = "/admin";
const inputClass = "h-9 w-24 rounded-lg border border-admin-border-strong bg-white px-2 text-right text-sm tabular-nums outline-none focus:border-admin-ink";

// The current price list, the currency customers see and the exchange rate, on
// the dashboard: every figure here is read live from the same tables the
// studio quote, bag and checkout use, and every save revalidates them.
export default async function PricesCurrencyPanel() {
  const grid = await getPriceGridData();
  const [placementRules, settings] = await Promise.all([
    prisma.placementPricingRule.findMany(),
    prisma.storeSetting.findUnique({ where: { id: "store" } }),
  ]);
  const display = effectiveDisplay(settings?.displayCurrency, settings?.usdToEgpRate);
  const selected = parseDisplayCurrency(settings?.displayCurrency);
  const rate = settings?.usdToEgpRate ?? null;
  const showConverted = display.currency !== "USD";
  const placementByKey = new Map(placementRules.map((rule) => [rule.placement, rule]));

  return (
    <Card
      className="mt-6"
      title="Prices & currency"
      subtitle="What customers pay right now. Change a price or the currency and it applies everywhere immediately — the builder, bag, checkout and quotes."
      actions={<a href="/admin/pricing" className="text-xs font-semibold text-admin-faint hover:text-admin-ink">Full pricing tools →</a>}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-admin-canvas p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-admin-faint">Currency customers see</p>
          <form action={updateDisplayCurrencyAction} className="mt-2 flex items-center gap-2">
            <input type="hidden" name="returnTo" value={RETURN_TO} />
            <select name="displayCurrency" defaultValue={selected} aria-label="Display currency" className="h-10 flex-1 rounded-xl border border-admin-border-strong bg-white px-3 text-sm outline-none focus:border-admin-ink">
              {DISPLAY_CURRENCIES.map((code) => (
                <option key={code} value={code}>{code === "USD" ? "USD — US dollar" : "EGP — Egyptian pound"}</option>
              ))}
            </select>
            <button className={buttonClass({ size: "sm", className: "h-10 px-4" })}>Apply</button>
          </form>
          <p className="mt-2 text-xs text-admin-faint">
            Showing <strong className="text-admin-ink">{display.currency}</strong>
            {selected === "EGP" && display.currency === "USD" ? " (EGP needs an exchange rate first)" : ""}. Orders are recorded in USD and paid in EGP.
          </p>
        </div>

        <div className="rounded-xl bg-admin-canvas p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-admin-faint">USD → EGP exchange rate</p>
          <form action={updateExchangeRateAction} className="mt-2 flex items-center gap-2">
            <input type="hidden" name="returnTo" value={RETURN_TO} />
            <span className="whitespace-nowrap text-sm text-admin-muted">1 USD =</span>
            <input name="usdToEgpRate" type="number" step="0.0001" min="0" defaultValue={rate ?? ""} placeholder="e.g. 50" required aria-label="Exchange rate" className="h-10 w-full min-w-0 rounded-xl border border-admin-border-strong bg-white px-3 text-sm outline-none focus:border-admin-ink" />
            <span className="text-sm text-admin-muted">EGP</span>
            <ConfirmSubmitButton variant="primary" size="sm" confirmMessage="Change the USD → EGP exchange rate? It applies to new quotes and checkouts only — existing orders keep their rate.">
              Save
            </ConfirmSubmitButton>
          </form>
          <p className="mt-2 text-xs text-admin-faint">
            {rate == null ? <span className="font-semibold text-red-600">Not set — checkout can&apos;t charge until it is.</span> : "Future checkouts only; existing orders keep theirs."}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-admin-faint">Price per piece (USD) · by quantity</p>
        <PriceGridEditor action={savePriceGridAction} returnTo={RETURN_TO} columns={grid.columns} meta={grid.meta} display={display} compact />
      </div>

      <div className="mt-6 border-t border-admin-border pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-admin-faint">Print position prices <span className="font-normal normal-case">(added per garment)</span></p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {CUSTOMER_PLACEMENTS.map((placement) => {
            const rule = placementByKey.get(placement);
            return (
              <form key={placement} action={upsertPlacementPricingRuleAction} className="flex items-center justify-between gap-2 rounded-xl border border-admin-border p-3">
                <input type="hidden" name="placement" value={placement} />
                <input type="hidden" name="returnTo" value={RETURN_TO} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-admin-ink">{customerPlacementLabel(placement)}</p>
                  <p className="text-xs text-admin-faint">
                    {rule ? (showConverted ? formatDisplayPrice(rule.unitPrice, display) : "USD") : <Badge tone="neutral">Free</Badge>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input name="unitPrice" type="number" step="0.01" min="0" defaultValue={rule?.unitPrice ?? ""} placeholder="0.00" required aria-label={`${customerPlacementLabel(placement)} price in USD`} className={inputClass.replace("w-24", "w-20")} />
                  <button className={buttonClass({ variant: "outline", size: "sm" })}>Save</button>
                </div>
              </form>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
