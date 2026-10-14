import DetailsPopover from "src/components/admin/ui/DetailsPopover";
import {
  createPricingRuleAction,
  deletePlacementPricingRuleAction,
  deletePricingRuleAction,
  updatePricingRuleAction,
  upsertPlacementPricingRuleAction,
} from "src/actions/admin-pricing-actions";
import { PLACEMENTS, placementLabel } from "src/pricing/placements";
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
              Rules used by the studio pricing engine. All prices below are in {PRICING_CURRENCY} — the fixed canonical pricing currency. Payment
              currency and the USD → EGP exchange rate used to convert orders at checkout are configured on the{" "}
              <a href="/admin/settings" className="underline underline-offset-2">Settings</a> page.
            </>
          }
        />

        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          <StatCard label="Active rules" value={pricingRules.length} />
          <StatCard label="Pricing currency" value={currency} />
          <StatCard label="Last update" value={lastUpdated ? lastUpdated.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"} />
        </section>

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
                          <Td className="font-semibold text-admin-ink">{currency} {rule.unitPrice.toFixed(2)}</Td>
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
                          <p className="font-semibold text-admin-ink">{currency} {rule.unitPrice.toFixed(2)}</p>
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
        <Card className="mt-6" padded={false} title="Placement prices" subtitle={`Extra ${currency} added per garment for each print position. A placement with no price adds nothing — it's free for the customer.`}>
          <div className="divide-y divide-admin-border">
            {PLACEMENTS.map((placement) => {
              const rule = placementRuleByKey.get(placement);
              return (
                <div key={placement} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-36 text-sm font-semibold text-admin-ink">{placementLabel(placement)}</span>
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
                        <ConfirmSubmitButton size="sm" confirmMessage={`Remove the price for ${placementLabel(placement)}?`}>Remove</ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </main>
  );
}
