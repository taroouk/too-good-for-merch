import DetailsPopover from "src/components/admin/ui/DetailsPopover";
import {
  bulkAdjustPricingAction,
  savePriceGridAction,
  createPricingRuleAction,
  deletePlacementPricingRuleAction,
  deletePricingRuleAction,
  updatePricingRuleAction,
  upsertPlacementPricingRuleAction,
} from "src/actions/admin-pricing-actions";
import { CUSTOMER_PLACEMENTS, customerPlacementLabel, type PlacementKey } from "src/pricing/placements";
import BulkPriceAdjust from "src/components/admin/BulkPriceAdjust";
import PriceGridEditor from "src/components/admin/PriceGridEditor";
import { getPriceGridData } from "src/lib/admin/price-grid-data";
import { getStoreDisplay } from "src/lib/store-display";
import { formatDisplayPrice } from "src/pricing/display";
import { prisma } from "src/lib/prisma";
import { getFabricCatalog } from "src/lib/catalog";
import AdminToast from "src/components/admin/AdminToast";
import { PRICING_CURRENCY } from "src/pricing/engine";
import PageHeader from "src/components/admin/ui/PageHeader";
import StatCard from "src/components/admin/ui/StatCard";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import { FieldLabel, Select } from "src/components/admin/ui/Input";
import EmptyState from "src/components/admin/ui/EmptyState";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import { Table, Tbody, Td, Th, Thead } from "src/components/admin/ui/Table";
import TableCardSwitch from "src/components/admin/ui/TableCardSwitch";
import { buttonClass } from "src/components/admin/ui/Button";

const inputClass = "h-10 w-full rounded-lg border border-admin-border-strong px-3 text-sm outline-none focus:border-admin-ink";

function EditRuleForm({ rule }: { rule: { id: string; product: string; fabric: string; minQty: number; maxQty: number; unitPrice: number } }) {
  return (
    <DetailsPopover className="group inline-block text-left">
      <summary className={buttonClass({ variant: "outline", size: "sm", className: "cursor-pointer list-none" })}>Edit</summary>
      <form action={updatePricingRuleAction} className="mt-3 w-72 space-y-3 rounded-xl border border-admin-border bg-white p-4 shadow-lg">
        <input type="hidden" name="id" value={rule.id} />
        <input type="hidden" name="product" value={rule.product} />
        <input type="hidden" name="fabric" value={rule.fabric} />
        <p className="text-xs font-semibold text-admin-ink">{rule.product} · {rule.fabric}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-admin-muted">Min qty<input name="minQty" type="number" min={1} defaultValue={rule.minQty} required className={inputClass} /></label>
          <label className="text-xs font-medium text-admin-muted">Max qty<input name="maxQty" type="number" min={1} defaultValue={rule.maxQty} required className={inputClass} /></label>
        </div>
        <label className="block text-xs font-medium text-admin-muted">Unit price (USD)<input name="unitPrice" type="number" step="0.01" min="0.01" defaultValue={rule.unitPrice} required className={inputClass} /></label>
        <button type="submit" className={buttonClass({ size: "sm", className: "w-full" })}>Save changes</button>
      </form>
    </DetailsPopover>
  );
}

export default async function AdminPricingPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams;
  const fabricCatalog = await getFabricCatalog();
  const display = await getStoreDisplay();
  const grid = await getPriceGridData();
  const [pricingRules, placementRules] = await Promise.all([
    prisma.pricingRule.findMany({
      orderBy: [
        { product: "asc" },
        { fabric: "asc" },
        { minQty: "asc" },
      ],
    }),
    prisma.placementPricingRule.findMany(),
  ]);
  const placementRuleByKey = new Map(placementRules.map((rule) => [rule.placement, rule]));
  // Pricing is always canonical USD (src/pricing/engine.ts's
  // PRICING_CURRENCY) -- never derived from StoreSetting.currency, which
  // is the unrelated *payment* currency configured on /admin/settings.
  // Relabeling these rows with the payment currency was the original bug.
  const currency = PRICING_CURRENCY;
  const lastUpdated = pricingRules.length ? new Date(Math.max(...pricingRules.map((rule) => rule.updatedAt.getTime()))) : null;

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Admin dashboard"
          title="Pricing Management"
          subtitle={
            <>
              Set what every T-shirt costs. Prices are entered in {PRICING_CURRENCY}; customers see {display.currency}. Change the display currency and the
              exchange rate on the{" "}
              <a href="/admin/settings" className="underline underline-offset-2">Settings</a> page.
            </>
          }
        />

        <section className="mt-7 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
          <StatCard label="Custom prices set" value={pricingRules.length} hint="Everything else uses the built-in default" />
          <StatCard label="Customers see" value={display.currency} />
          <StatCard label="Last update" value={lastUpdated ? lastUpdated.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"} />
        </section>

        <Card className="mt-6" title="Price list" subtitle="What customers pay per piece right now, for every product, fabric and quantity. Click a price to change it, edit as many as you like, then save once.">
          <PriceGridEditor action={savePriceGridAction} returnTo="/admin/pricing" columns={grid.columns} meta={grid.meta} display={display} />
        </Card>

        <Card className="mt-6" title="Adjust all prices" subtitle="Raise or lower many prices at once. You see every new price before anything changes.">
            <BulkPriceAdjust
              action={bulkAdjustPricingAction}
              rows={pricingRules.map((rule) => ({ product: rule.product, fabric: rule.fabric, label: `${rule.product} · ${rule.fabric}`, detail: `Qty ${rule.minQty}–${rule.maxQty}`, unitPrice: rule.unitPrice }))}
              placementRows={placementRules.filter((rule) => (CUSTOMER_PLACEMENTS as readonly string[]).includes(rule.placement)).map((rule) => ({ product: "", fabric: "", label: customerPlacementLabel(rule.placement as PlacementKey), detail: "Print position", unitPrice: rule.unitPrice }))}
              products={["FITTED", "OVERSIZED"]}
              fabrics={fabricCatalog.map((fabric) => fabric.key)}
              display={display}
            />
        </Card>
        <Card className="mt-6" padded={false} title="Placement prices" subtitle={`Extra ${currency} added per garment for each print position. A placement with no price adds nothing — it's free for the customer.`}>
          <div className="divide-y divide-admin-border">
            {CUSTOMER_PLACEMENTS.map((placement) => {
              const rule = placementRuleByKey.get(placement);
              return (
                <div key={placement} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-36 text-sm font-semibold text-admin-ink">{customerPlacementLabel(placement)}</span>
                    {rule ? null : <Badge tone="neutral">Free (no price set)</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={upsertPlacementPricingRuleAction} className="flex items-center gap-2">
                      <input type="hidden" name="placement" value={placement} />
                      <span className="text-xs text-admin-faint">{currency}</span>
                      <input name="unitPrice" type="number" step="0.01" min="0" defaultValue={rule?.unitPrice ?? ""} required placeholder="0.00" className="h-9 w-28 rounded-lg border border-admin-border-strong px-3 text-sm outline-none focus:border-admin-ink" />
                      <button type="submit" className={buttonClass({ variant: "outline", size: "sm" })}>Save</button>
                    </form>
                    {rule ? (
                      <form action={deletePlacementPricingRuleAction}>
                        <input type="hidden" name="id" value={rule.id} />
                        <ConfirmSubmitButton size="sm" confirmMessage={`Remove the price for ${customerPlacementLabel(placement)}?`}>Remove</ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <details className="group mt-6 rounded-2xl border border-admin-border bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <span>
              <span className="block text-sm font-semibold text-admin-ink">Advanced: custom quantity tiers</span>
              <span className="block text-xs text-admin-faint">Add or edit price rules with your own quantity ranges. Most stores never need this — the price list above covers the standard ranges.</span>
            </span>
            <span className="text-xs font-semibold text-admin-faint group-open:hidden">Show</span>
            <span className="hidden text-xs font-semibold text-admin-faint group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-admin-border p-5">
        <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          <Card title="Add pricing rule">
            <form action={createPricingRuleAction} className="space-y-4">
              <FieldLabel label="Product">
                <Select name="product" required defaultValue="">
                  <option value="" disabled>Select product</option>
                  <option value="FITTED">FITTED</option>
                  <option value="OVERSIZED">OVERSIZED</option>
                </Select>
              </FieldLabel>

              <FieldLabel label="Fabric">
                <Select name="fabric" required defaultValue="">
                  <option value="" disabled>Select fabric</option>
                  {fabricCatalog.map((fabric) => (
                    <option key={fabric.key} value={fabric.key}>{fabric.key}{fabric.active ? "" : " (hidden)"}</option>
                  ))}
                </Select>
              </FieldLabel>

              <div className="grid grid-cols-2 gap-3">
                <FieldLabel label="Min Qty">
                  <input name="minQty" type="number" min={1} required className="h-11 w-full rounded-xl border border-admin-border-strong px-4 text-sm outline-none focus:border-admin-ink" />
                </FieldLabel>
                <FieldLabel label="Max Qty">
                  <input name="maxQty" type="number" min={1} required className="h-11 w-full rounded-xl border border-admin-border-strong px-4 text-sm outline-none focus:border-admin-ink" />
                </FieldLabel>
              </div>

              <FieldLabel label={`Unit Price ${currency}`}>
                <input name="unitPrice" type="number" step="0.01" min="0.01" required className="h-11 w-full rounded-xl border border-admin-border-strong px-4 text-sm outline-none focus:border-admin-ink" />
              </FieldLabel>

              <button type="submit" className={buttonClass({ className: "w-full" })}>
                Create pricing rule
              </button>
            </form>
          </Card>

          <Card padded={false} title="Pricing rules" subtitle={`${pricingRules.length} rule${pricingRules.length === 1 ? "" : "s"}`}>
            {pricingRules.length > 0 ? (
              <TableCardSwitch
                minWidth={760}
                table={
                  <Table minWidth={760}>
                    <Thead>
                      <tr>
                        <Th>Product</Th>
                        <Th>Fabric</Th>
                        <Th>Min Qty</Th>
                        <Th>Max Qty</Th>
                        <Th>Unit Price</Th>
                        <Th align="right">Action</Th>
                      </tr>
                    </Thead>
                    <Tbody>
                      {pricingRules.map((rule) => (
                        <tr key={rule.id}>
                          <Td className="font-semibold text-admin-ink">{rule.product}</Td>
                          <Td>{rule.fabric}</Td>
                          <Td>{rule.minQty}</Td>
                          <Td>{rule.maxQty}</Td>
                          <Td className="font-semibold text-admin-ink">{currency} {rule.unitPrice.toFixed(2)}{display.currency !== "USD" ? <span className="ml-2 text-xs font-normal text-admin-faint">≈ {formatDisplayPrice(rule.unitPrice, display)}</span> : null}</Td>
                          <Td align="right">
                            <div className="flex items-start justify-end gap-2">
                            <EditRuleForm rule={rule} />
                            <form action={deletePricingRuleAction}>
                              <input type="hidden" name="id" value={rule.id} />
                              <ConfirmSubmitButton size="sm" confirmMessage={`Delete the pricing rule for ${rule.product} · ${rule.fabric} (qty ${rule.minQty}-${rule.maxQty})?`}>
                                Delete
                              </ConfirmSubmitButton>
                            </form>
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </Tbody>
                  </Table>
                }
                cards={
                  <div className="divide-y divide-admin-border">
                    {pricingRules.map((rule) => (
                      <div key={rule.id} className="px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-admin-ink">{rule.product} · {rule.fabric}</p>
                            <p className="mt-1 text-xs text-admin-faint">Qty {rule.minQty}–{rule.maxQty}</p>
                          </div>
                          <p className="text-right font-semibold text-admin-ink">{currency} {rule.unitPrice.toFixed(2)}{display.currency !== "USD" ? <span className="block text-xs font-normal text-admin-faint">≈ {formatDisplayPrice(rule.unitPrice, display)}</span> : null}</p>
                        </div>
                        <div className="mt-3 flex items-start gap-2">
                        <EditRuleForm rule={rule} />
                        <form action={deletePricingRuleAction}>
                          <input type="hidden" name="id" value={rule.id} />
                          <ConfirmSubmitButton size="sm" confirmMessage={`Delete the pricing rule for ${rule.product} · ${rule.fabric} (qty ${rule.minQty}-${rule.maxQty})?`}>
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                        </div>
                      </div>
                    ))}
                  </div>
                }
              />
            ) : (
              <EmptyState title="No pricing rules yet" description="Add one using the form to the left." />
            )}
          </Card>
        </div>
          </div>
        </details>
      </div>
    </main>
  );
}
