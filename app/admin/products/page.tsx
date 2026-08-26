import Link from "next/link";
import { prisma } from "src/lib/prisma";
import { PLACEMENTS, placementLabel } from "src/pricing/placements";
import PageHeader from "src/components/admin/ui/PageHeader";
import StatCard from "src/components/admin/ui/StatCard";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import { Table, Tbody, Td, Th, Thead } from "src/components/admin/ui/Table";
import TableCardSwitch from "src/components/admin/ui/TableCardSwitch";
import { CATALOG_FABRICS, CATALOG_PRODUCTS, getPricingHealth } from "src/lib/admin/pricing-health";

// CUSTOM product/color is a bespoke request handled outside the standard
// quantity-tier pricing table (see src/pricing/engine.ts), so it's called
// out separately rather than folded into the priced grid below.

const COLORS = [
  { key: "BLACK", name: "Black" },
  { key: "WHITE", name: "White" },
] as const;

export default async function AdminProductsPage() {
  const [placementRules, pricingHealth] = await Promise.all([
    prisma.placementPricingRule.findMany({ select: { placement: true, unitPrice: true } }),
    getPricingHealth(),
  ]);
  const placementPriceByKey = new Map(placementRules.map((rule) => [rule.placement, rule.unitPrice]));
  const { pricedCount, missingCombos, pricingRuleCount, lastPricingUpdate, usdToEgpRate, currency, coverage } = pricingHealth;

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Catalog"
          title="Products"
          subtitle={
            <>
              The product, fabric, colour, and placement options the Studio builder currently offers customers. These are fixed configuration
              values, not database rows — changing the set itself requires a code change, but every combination&apos;s price is set on the{" "}
              <Link href="/admin/pricing" className="font-semibold underline">Pricing</Link> page.
            </>
          }
        />

        <Card className="mt-7" title="Product types">
          <div className="grid gap-4 sm:grid-cols-2">
            {CATALOG_PRODUCTS.map((product) => (
              <div key={product.key} className="rounded-xl border border-admin-border p-4">
                <p className="font-semibold text-admin-ink">{product.name}</p>
                <p className="mt-1 text-xs text-admin-faint">{product.desc}</p>
                <p className="mt-2 font-mono text-[10px] text-admin-faint">{product.key}</p>
              </div>
            ))}
            <div className="rounded-xl border border-dashed border-admin-border-strong p-4">
              <p className="font-semibold text-admin-ink">Bespoke</p>
              <p className="mt-1 text-xs text-admin-faint">Custom garment, routed to a tailored quote instead of the pricing table.</p>
              <p className="mt-2 font-mono text-[10px] text-admin-faint">CUSTOM</p>
            </div>
          </div>
        </Card>

        <Card className="mt-6" title="Fabric tiers">
          <div className="grid gap-4 sm:grid-cols-3">
            {CATALOG_FABRICS.map((fabric) => (
              <div key={fabric.key} className="rounded-xl border border-admin-border p-4">
                <p className="font-semibold text-admin-ink">{fabric.name}</p>
                <p className="mt-1 text-xs font-medium text-admin-muted">{fabric.gsm}</p>
                <p className="mt-2 text-xs text-admin-faint">{fabric.desc}</p>
                <p className="mt-2 font-mono text-[10px] text-admin-faint">{fabric.key}</p>
              </div>
            ))}
          </div>
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
                        <Td>{price !== undefined ? <span className="font-semibold text-admin-ink">+{price.toFixed(2)}</span> : <Badge tone="warning">Not priced</Badge>}</Td>
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
                      {price !== undefined ? <span className="font-semibold text-admin-ink">+{price.toFixed(2)}</span> : <Badge tone="warning">Not priced</Badge>}
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
                    {CATALOG_PRODUCTS.find((p) => p.key === product)?.name} · {CATALOG_FABRICS.find((f) => f.key === fabric)?.name}
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
