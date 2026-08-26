import {
  createPricingRuleAction,
  deletePricingRuleAction,
} from "src/actions/admin-pricing-actions";
import { prisma } from "src/lib/prisma";
import AdminToast from "src/components/admin/AdminToast";
import { PRICING_CURRENCY } from "src/pricing/engine";
import PageHeader from "src/components/admin/ui/PageHeader";
import StatCard from "src/components/admin/ui/StatCard";
import Card from "src/components/admin/ui/Card";
import { FieldLabel, Select } from "src/components/admin/ui/Input";
import EmptyState from "src/components/admin/ui/EmptyState";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import { Table, Tbody, Td, Th, Thead } from "src/components/admin/ui/Table";
import TableCardSwitch from "src/components/admin/ui/TableCardSwitch";
import { buttonClass } from "src/components/admin/ui/Button";

export default async function AdminPricingPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams;
  const pricingRules = await prisma.pricingRule.findMany({
    orderBy: [
      { product: "asc" },
      { fabric: "asc" },
      { minQty: "asc" },
    ],
  });
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
                  <option value="ESSENTIALS_170">ESSENTIALS_170</option>
                  <option value="SIGNATURE_200">SIGNATURE_200</option>
                  <option value="HEAVYWEIGHT_300">HEAVYWEIGHT_300</option>
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
                            <form action={deletePricingRuleAction}>
                              <input type="hidden" name="id" value={rule.id} />
                              <ConfirmSubmitButton size="sm" confirmMessage={`Delete the pricing rule for ${rule.product} · ${rule.fabric} (qty ${rule.minQty}-${rule.maxQty})?`}>
                                Delete
                              </ConfirmSubmitButton>
                            </form>
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
                        <form action={deletePricingRuleAction} className="mt-3">
                          <input type="hidden" name="id" value={rule.id} />
                          <ConfirmSubmitButton size="sm" confirmMessage={`Delete the pricing rule for ${rule.product} · ${rule.fabric} (qty ${rule.minQty}-${rule.maxQty})?`}>
                            Delete
                          </ConfirmSubmitButton>
                        </form>
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
    </main>
  );
}
