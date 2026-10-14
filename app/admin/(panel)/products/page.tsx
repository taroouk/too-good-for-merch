import DetailsPopover from "src/components/admin/ui/DetailsPopover";
import Link from "next/link";
import { setCatalogPausedAction } from "src/actions/admin-pricing-actions";
import AdminToast from "src/components/admin/AdminToast";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import { buttonClass } from "src/components/admin/ui/Button";
import { prisma } from "src/lib/prisma";
import { PLACEMENTS, placementLabel } from "src/pricing/placements";
import PageHeader from "src/components/admin/ui/PageHeader";
import StatCard from "src/components/admin/ui/StatCard";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import { Table, Tbody, Td, Th, Thead } from "src/components/admin/ui/Table";
import TableCardSwitch from "src/components/admin/ui/TableCardSwitch";
import { CATALOG_PRODUCTS, getPricingHealth } from "src/lib/admin/pricing-health";
import { createFabricAction, deleteFabricAction, setFabricActiveAction, updateFabricAction, updateProductCopyAction } from "src/actions/admin-catalog-actions";
import { getFabricCatalog, getProductCopy } from "src/lib/catalog";

// CUSTOM product/color is a bespoke request handled outside the standard
// quantity-tier pricing table (see src/pricing/engine.ts), so it's called
// out separately rather than folded into the priced grid below.

const COLORS = [
  { key: "BLACK", name: "Black" },
  { key: "WHITE", name: "White" },
] as const;

const fieldClass = "h-10 w-full rounded-lg border border-admin-border-strong px-3 text-sm outline-none focus:border-admin-ink";

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams;
  const [fabricCatalog, productCopy] = await Promise.all([getFabricCatalog(), getProductCopy()]);
  const activeFabrics = fabricCatalog.filter((fabric) => fabric.active);
  const [placementRules, pricingHealth] = await Promise.all([
    prisma.placementPricingRule.findMany({ select: { placement: true, unitPrice: true } }),
    getPricingHealth(),
  ]);
  const placementPriceByKey = new Map(placementRules.map((rule) => [rule.placement, rule.unitPrice]));
  const { pausedCombos } = pricingHealth;
  const pausedByKey = new Map(pausedCombos.map((pause) => [`${pause.product}:${pause.fabric}`, pause]));
  const { pricedCount, missingCombos, pricingRuleCount, lastPricingUpdate, usdToEgpRate, currency, coverage } = pricingHealth;

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Catalog"
          title="Products"
          subtitle={
            <>
              What the Studio builder offers customers. Fabrics are fully editable below; silhouettes and colours are tied to mockup templates, so only their names are editable. Every
              combination&apos;s price is set on the{" "}
              <Link href="/admin/pricing" className="font-semibold underline">Pricing</Link> page.
            </>
          }
        />

        <Card className="mt-7" padded={false} title="Availability" subtitle="Pause a product + fabric to stop selling it instantly (stock-out, supplier issue). Paused options can't be purchased; resume any time.">
          <div className="divide-y divide-admin-border">
            {CATALOG_PRODUCTS.flatMap((product) =>
              activeFabrics.map((fabric) => {
                const pause = pausedByKey.get(`${product.key}:${fabric.key}`);
                return (
                  <div key={`${product.key}:${fabric.key}`} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-admin-ink">{productCopy[product.key].name} · {fabric.name}</p>
                      <p className="mt-1 text-xs text-admin-faint">{pause ? `Paused${pause.reason ? ` — ${pause.reason}` : ""}` : "On sale"}</p>
                    </div>
                    <form action={setCatalogPausedAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="product" value={product.key} />
                      <input type="hidden" name="fabric" value={fabric.key} />
                      <input type="hidden" name="pause" value={pause ? "false" : "true"} />
                      {pause ? null : <input name="reason" maxLength={140} placeholder="Reason shown to customers (optional)" className="h-9 w-64 rounded-lg border border-admin-border-strong px-3 text-sm outline-none focus:border-admin-ink" />}
                      {pause ? (
                        <button className={buttonClass({ variant: "secondary", size: "sm" })}>Resume selling</button>
                      ) : (
                        <ConfirmSubmitButton size="sm" confirmMessage={`Pause ${productCopy[product.key].name} · ${fabric.name}? Customers won't be able to buy it until you resume.`}>Pause selling</ConfirmSubmitButton>
                      )}
                    </form>
                  </div>
                );
              }),
            )}
          </div>
        </Card>

        <Card className="mt-6" title="Product types" subtitle="Rename a silhouette or change its tagline — the Studio picks it up immediately. The set of silhouettes is tied to mockup templates and stays fixed.">
          <div className="grid gap-4 sm:grid-cols-2">
            {CATALOG_PRODUCTS.map((product) => (
              <form key={product.key} action={updateProductCopyAction} className="space-y-2 rounded-xl border border-admin-border p-4">
                <input type="hidden" name="product" value={product.key} />
                <input name="name" defaultValue={productCopy[product.key].name} required minLength={2} maxLength={60} aria-label={`${product.key} name`} className={fieldClass} />
                <input name="tagline" defaultValue={productCopy[product.key].tagline} required minLength={2} maxLength={30} aria-label={`${product.key} tagline`} className={fieldClass} />
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] text-admin-faint">{product.key}</p>
                  <button className={buttonClass({ variant: "outline", size: "sm" })}>Save</button>
                </div>
              </form>
            ))}
            <div className="rounded-xl border border-dashed border-admin-border-strong p-4">
              <p className="font-semibold text-admin-ink">Bespoke</p>
              <p className="mt-1 text-xs text-admin-faint">Custom garment, routed to a tailored quote instead of the pricing table.</p>
              <p className="mt-2 font-mono text-[10px] text-admin-faint">CUSTOM</p>
            </div>
          </div>
        </Card>

        <Card className="mt-6" padded={false} title="Fabrics" subtitle="Add, edit, hide or remove fabrics. A new fabric starts hidden: price it on the Pricing page, then activate it.">
          <div className="divide-y divide-admin-border">
            {fabricCatalog.map((fabric) => (
              <div key={fabric.key} className="px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-admin-ink">
                      {fabric.name}
                      <Badge tone={fabric.active ? "success" : "neutral"}>{fabric.active ? "Offered" : "Hidden"}</Badge>
                    </p>
                    <p className="mt-1 text-xs font-medium text-admin-muted">{fabric.gsm}</p>
                    <p className="mt-1 text-xs text-admin-faint">{fabric.desc}</p>
                    <p className="mt-1 font-mono text-[10px] text-admin-faint">{fabric.key}</p>
                  </div>
                  {fabric.id ? (
                    <div className="flex shrink-0 flex-wrap items-start gap-2">
                      <DetailsPopover>
                        <summary className={buttonClass({ variant: "outline", size: "sm", className: "cursor-pointer list-none" })}>Edit</summary>
                        <form action={updateFabricAction} className="mt-3 w-80 space-y-2 rounded-xl border border-admin-border bg-white p-4 shadow-lg">
                          <input type="hidden" name="id" value={fabric.id} />
                          <input name="name" defaultValue={fabric.name} required maxLength={40} aria-label="Fabric name" className={fieldClass} />
                          <input name="gsm" defaultValue={fabric.gsm} required maxLength={40} aria-label="Weight label" className={fieldClass} />
                          <textarea name="description" defaultValue={fabric.desc} required maxLength={300} rows={3} aria-label="Description" className="w-full rounded-lg border border-admin-border-strong px-3 py-2 text-sm outline-none focus:border-admin-ink" />
                          <label className="block text-xs font-medium text-admin-muted">Sort order (lower shows first)<input name="sortOrder" type="number" min={0} defaultValue={fabric.sortOrder} required className={fieldClass} /></label>
                          <button className={buttonClass({ size: "sm", className: "w-full" })}>Save changes</button>
                        </form>
                      </DetailsPopover>
                      <form action={setFabricActiveAction}>
                        <input type="hidden" name="id" value={fabric.id} />
                        <input type="hidden" name="active" value={fabric.active ? "false" : "true"} />
                        {fabric.active ? (
                          <ConfirmSubmitButton variant="outline" size="sm" confirmMessage={`Hide ${fabric.name}? Customers won't be able to pick or buy it.`}>Hide</ConfirmSubmitButton>
                        ) : (
                          <button className={buttonClass({ variant: "secondary", size: "sm" })}>Activate</button>
                        )}
                      </form>
                      <form action={deleteFabricAction}>
                        <input type="hidden" name="id" value={fabric.id} />
                        <ConfirmSubmitButton size="sm" confirmMessage={`Delete ${fabric.name}? This only works if nothing references it.`}>Delete</ConfirmSubmitButton>
                      </form>
                    </div>
                  ) : (
                    <p className="text-xs text-admin-faint">Built-in defaults (catalog table not available).</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form action={createFabricAction} className="grid gap-3 border-t border-admin-border bg-admin-canvas p-5 sm:grid-cols-2 xl:grid-cols-5">
            <input name="key" required placeholder="KEY e.g. LINEN_180" pattern="[A-Za-z][A-Za-z0-9_]{2,39}" maxLength={40} aria-label="Fabric key" className={fieldClass} />
            <input name="name" required placeholder="Name e.g. LINEN" maxLength={40} aria-label="Fabric name" className={fieldClass} />
            <input name="gsm" required placeholder="180 GSM Linen" maxLength={40} aria-label="Weight label" className={fieldClass} />
            <input name="description" required placeholder="Short description" maxLength={300} aria-label="Description" className={fieldClass} />
            <button className={buttonClass()}>Add fabric</button>
          </form>
        </Card>

        <Card className="mt-6" title="Colours">
          <div className="flex flex-wrap gap-4">
            {COLORS.map((color) => (
              <div key={color.key} className="flex items-center gap-3 rounded-xl border border-admin-border px-4 py-3">
                <span className={`h-6 w-6 rounded-full border border-admin-border ${color.key === "BLACK" ? "bg-black" : "bg-white"}`} />
                <span className="text-sm font-semibold text-admin-ink">{color.name}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-admin-border-strong px-4 py-3">
              <span className="text-sm font-semibold text-admin-muted">Custom colour</span>
              <span className="text-xs text-admin-faint">Bespoke request</span>
            </div>
          </div>
        </Card>

        <Card
          className="mt-6"
          padded={false}
          title="Placements"
          actions={<Link href="/admin/pricing" className="text-xs font-semibold text-admin-faint hover:text-admin-ink">Edit placement prices →</Link>}
        >
          <TableCardSwitch
            minWidth={520}
            table={
              <Table minWidth={520}>
                <Thead><tr><Th>Placement</Th><Th>Price modifier</Th></tr></Thead>
                <Tbody>
                  {PLACEMENTS.map((placement) => {
                    const price = placementPriceByKey.get(placement);
                    return (
                      <tr key={placement}>
                        <Td className="font-semibold text-admin-ink">{placementLabel(placement)}</Td>
                        <Td>{price !== undefined ? <span className="font-semibold text-admin-ink">+{price.toFixed(2)}</span> : <Badge tone="neutral">Free</Badge>}</Td>
                      </tr>
                    );
                  })}
                </Tbody>
              </Table>
            }
            cards={
              <div className="divide-y divide-admin-border">
                {PLACEMENTS.map((placement) => {
                  const price = placementPriceByKey.get(placement);
                  return (
                    <div key={placement} className="flex items-center justify-between px-4 py-3">
                      <span className="font-semibold text-admin-ink">{placementLabel(placement)}</span>
                      {price !== undefined ? <span className="font-semibold text-admin-ink">+{price.toFixed(2)}</span> : <Badge tone="neutral">Free</Badge>}
                    </div>
                  );
                })}
              </div>
            }
          />
        </Card>

        <Card className="mt-6" padded={false} title="Pricing health" subtitle="A live snapshot of what checkout can actually price right now.">
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Products with pricing" value={`${pricedCount} / ${coverage.length}`} />
            <StatCard label="Products missing pricing" value={missingCombos.length} tone={missingCombos.length ? "warning" : "default"} />
            <StatCard label="Active pricing rules" value={pricingRuleCount} />
            <StatCard label="Store pricing currency" value={currency} />
            <StatCard
              label="USD → EGP exchange rate"
              value={usdToEgpRate != null ? `1 = ${usdToEgpRate} EGP` : "Not configured"}
              tone={usdToEgpRate != null ? "default" : "danger"}
            />
            <StatCard label="Last pricing update" value={lastPricingUpdate ? lastPricingUpdate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"} />
          </div>

          {missingCombos.length > 0 ? (
            <div className="border-t border-admin-border px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Needs a price before it can be sold</p>
              <ul className="mt-2 space-y-1 text-sm">
                {missingCombos.map(({ product, fabric }) => (
                  <li key={`${product}:${fabric}`} className="text-admin-muted">
                    {productCopy[product as "FITTED" | "OVERSIZED"]?.name ?? product} · {fabricCatalog.find((f) => f.key === fabric)?.name ?? fabric}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
