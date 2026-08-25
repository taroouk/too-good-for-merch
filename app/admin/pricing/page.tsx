import {
    createPricingRuleAction,
    deletePricingRuleAction,
    deletePlacementPricingRuleAction,
    upsertPlacementPricingRuleAction,
  } from "src/actions/admin-pricing-actions";
  import { prisma } from "src/lib/prisma";
  import AdminToast from "src/components/admin/AdminToast";
  import { PLACEMENTS, placementLabel } from "src/pricing/placements";
  import { PRICING_CURRENCY } from "src/pricing/engine";

  export default async function AdminPricingPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
    const query = await searchParams;
    const [pricingRules, placementRules] = await Promise.all([
      prisma.pricingRule.findMany({
        orderBy: [
          { product: "asc" },
          { fabric: "asc" },
          { minQty: "asc" },
        ],
      }),
      prisma.placementPricingRule.findMany({ orderBy: { placement: "asc" } }),
    ]);
    // Pricing is always canonical USD (src/pricing/engine.ts's
    // PRICING_CURRENCY) -- never derived from StoreSetting.currency, which
    // is the unrelated *payment* currency configured on /admin/settings.
    // Relabeling these rows with the payment currency was the original bug.
    const currency = PRICING_CURRENCY;
    const configuredPlacements = new Set(placementRules.map((rule) => rule.placement));
    const unconfiguredPlacements = PLACEMENTS.filter((placement) => !configuredPlacements.has(placement));
  
    return (
      <main className="px-4 py-10">
        <AdminToast message={query.notice} />
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
            <p className="text-sm font-medium text-[#a56a2a]">
              Admin Dashboard
            </p>
  
            <h1 className="mt-2 text-3xl font-semibold">
              Pricing Management
            </h1>
  
            <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
              Manage pricing rules used by the studio pricing engine. All prices below are in {PRICING_CURRENCY}
              — this is the fixed canonical pricing currency. Payment currency and the USD → EGP exchange rate
              used to convert orders at checkout are configured on the <a href="/admin/settings" className="underline underline-offset-2">Settings</a> page.
            </p>
          </div>
  
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <section className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Add pricing rule</h2>
  
              <form action={createPricingRuleAction} className="mt-5 space-y-4">
                <div>
                  <label className="text-sm font-medium">Product</label>
                  <select
                    name="product"
                    required
                    defaultValue=""
                    className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black"
                  >
                    <option value="" disabled>
                      Select product
                    </option>
                    <option value="FITTED">FITTED</option>
                    <option value="OVERSIZED">OVERSIZED</option>
                  </select>
                </div>
  
                <div>
                  <label className="text-sm font-medium">Fabric</label>
                  <select
                    name="fabric"
                    required
                    defaultValue=""
                    className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black"
                  >
                    <option value="" disabled>
                      Select fabric
                    </option>
                    <option value="ESSENTIALS_170">ESSENTIALS_170</option>
                    <option value="SIGNATURE_200">SIGNATURE_200</option>
                    <option value="HEAVYWEIGHT_300">HEAVYWEIGHT_300</option>
                  </select>
                </div>
  
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Min Qty</label>
                    <input
                      name="minQty"
                      type="number"
                      min={1}
                      required
                      className="mt-2 h-11 w-full rounded-xl border border-black/10 px-4 text-sm outline-none focus:border-black"
                    />
                  </div>
  
                  <div>
                    <label className="text-sm font-medium">Max Qty</label>
                    <input
                      name="maxQty"
                      type="number"
                      min={1}
                      required
                      className="mt-2 h-11 w-full rounded-xl border border-black/10 px-4 text-sm outline-none focus:border-black"
                    />
                  </div>
                </div>
  
                <div>
                  <label className="text-sm font-medium">Unit Price {currency}</label>
                  <input
                    name="unitPrice"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="mt-2 h-11 w-full rounded-xl border border-black/10 px-4 text-sm outline-none focus:border-black"
                  />
                </div>
  
                <button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-black px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                  Create Pricing Rule
                </button>
              </form>
            </section>
  
            <section className="overflow-hidden rounded-[32px] bg-white shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <div className="border-b border-black/10 px-6 py-5">
                <h2 className="text-lg font-semibold">Pricing Rules</h2>
                <p className="mt-1 text-sm text-black/50">
                  {pricingRules.length} rule
                  {pricingRules.length === 1 ? "" : "s"}
                </p>
              </div>
  
              {pricingRules.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-[#faf8f6] text-xs uppercase tracking-wide text-black/50">
                      <tr>
                        <th className="px-6 py-4">Product</th>
                        <th className="px-6 py-4">Fabric</th>
                        <th className="px-6 py-4">Min Qty</th>
                        <th className="px-6 py-4">Max Qty</th>
                        <th className="px-6 py-4">Unit Price</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
  
                    <tbody className="divide-y divide-black/10">
                      {pricingRules.map((rule) => (
                        <tr key={rule.id}>
                          <td className="px-6 py-5 font-semibold">
                            {rule.product}
                          </td>
  
                          <td className="px-6 py-5">{rule.fabric}</td>
  
                          <td className="px-6 py-5">{rule.minQty}</td>
  
                          <td className="px-6 py-5">{rule.maxQty}</td>
  
                          <td className="px-6 py-5 font-semibold text-[#a56a2a]">
                            {currency} {rule.unitPrice.toFixed(2)}
                          </td>
  
                          <td className="px-6 py-5 text-right">
                            <form action={deletePricingRuleAction}>
                              <input type="hidden" name="id" value={rule.id} />
  
                              <button
                                type="submit"
                                className="rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-6 py-16 text-center">
                  <p className="text-sm text-black/50">
                    No pricing rules found yet.
                  </p>
                </div>
              )}
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
            <section className="rounded-[32px] bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <h2 className="text-lg font-semibold">Placement pricing</h2>
              <p className="mt-2 text-sm leading-6 text-black/60">
                Added on top of the base unit price for every placement selected on an order. Saving an existing placement updates its price.
              </p>

              <form action={upsertPlacementPricingRuleAction} className="mt-5 space-y-4">
                <div>
                  <label className="text-sm font-medium">Placement</label>
                  <select
                    name="placement"
                    required
                    defaultValue=""
                    className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-black"
                  >
                    <option value="" disabled>
                      Select placement
                    </option>
                    {PLACEMENTS.map((placement) => (
                      <option key={placement} value={placement}>
                        {placementLabel(placement)}
                        {configuredPlacements.has(placement) ? " (configured)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Price modifier {currency}</label>
                  <input
                    name="unitPrice"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="mt-2 h-11 w-full rounded-xl border border-black/10 px-4 text-sm outline-none focus:border-black"
                  />
                </div>

                <button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-black px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                  Save placement price
                </button>
              </form>

              {unconfiguredPlacements.length > 0 ? (
                <p className="mt-4 text-xs leading-5 text-amber-700">
                  No price configured for: {unconfiguredPlacements.map(placementLabel).join(", ")}. Orders using these placements add nothing on top of the base price.
                </p>
              ) : null}
            </section>

            <section className="overflow-hidden rounded-[32px] bg-white shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <div className="border-b border-black/10 px-6 py-5">
                <h2 className="text-lg font-semibold">Placement modifiers</h2>
                <p className="mt-1 text-sm text-black/50">
                  {placementRules.length} of {PLACEMENTS.length} placements priced
                </p>
              </div>

              {placementRules.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="bg-[#faf8f6] text-xs uppercase tracking-wide text-black/50">
                      <tr>
                        <th className="px-6 py-4">Placement</th>
                        <th className="px-6 py-4">Price modifier</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-black/10">
                      {placementRules.map((rule) => (
                        <tr key={rule.id}>
                          <td className="px-6 py-5 font-semibold">
                            {placementLabel(rule.placement)}
                          </td>

                          <td className="px-6 py-5 font-semibold text-[#a56a2a]">
                            {currency} {rule.unitPrice.toFixed(2)}
                          </td>

                          <td className="px-6 py-5 text-right">
                            <form action={deletePlacementPricingRuleAction}>
                              <input type="hidden" name="id" value={rule.id} />

                              <button
                                type="submit"
                                className="rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-6 py-16 text-center">
                  <p className="text-sm text-black/50">
                    No placement pricing configured yet — placements add nothing to the base price.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    );
  }
