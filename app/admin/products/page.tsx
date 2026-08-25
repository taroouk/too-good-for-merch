import Link from "next/link";
import { prisma } from "src/lib/prisma";
import { PLACEMENTS, placementLabel } from "src/pricing/placements";

const PRODUCTS = [
  { key: "FITTED", name: "Fitted T-Shirt", desc: "Classic silhouette." },
  { key: "OVERSIZED", name: "Oversized T-Shirt", desc: "Relaxed silhouette." },
] as const;

const FABRICS = [
  { key: "ESSENTIALS_170", name: "Essentials", gsm: "170 GSM Cotton", desc: "Lightweight everyday cotton with a clean minimal hand feel." },
  { key: "SIGNATURE_200", name: "Signature", gsm: "200 GSM Cotton", desc: "Balanced premium weight — smooth, buttery, structured." },
  { key: "HEAVYWEIGHT_300", name: "Premium", gsm: "300 GSM Cotton", desc: "Dense luxury cotton with elevated structure and drape." },
] as const;

const COLORS = [
  { key: "BLACK", name: "Black" },
  { key: "WHITE", name: "White" },
] as const;

// CUSTOM product/color is a bespoke request handled outside the standard
// quantity-tier pricing table (see src/pricing/engine.ts), so it's called
// out separately rather than folded into the priced grid below.

export default async function AdminProductsPage() {
  const [pricingRules, placementRules] = await Promise.all([
    prisma.pricingRule.findMany({ select: { product: true, fabric: true } }),
    prisma.placementPricingRule.findMany({ select: { placement: true, unitPrice: true } }),
  ]);
  const ruleCountByCombo = new Map<string, number>();
  for (const rule of pricingRules) {
    const key = `${rule.product}:${rule.fabric}`;
    ruleCountByCombo.set(key, (ruleCountByCombo.get(key) ?? 0) + 1);
  }
  const placementPriceByKey = new Map(placementRules.map((rule) => [rule.placement, rule.unitPrice]));

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Catalog</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Products</h1>
            <p className="mt-2 max-w-2xl text-sm text-black/45">
              The product, fabric, colour, and placement options the Studio builder currently offers customers. These are fixed configuration values, not database rows — changing the set itself requires a code change, but every combination&apos;s price is set on the <Link href="/admin/pricing" className="font-semibold underline">Pricing</Link> page.
            </p>
          </div>
        </div>

        <section className="mt-7 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-5 py-4">
            <h2 className="font-semibold">Product types</h2>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {PRODUCTS.map((product) => (
              <div key={product.key} className="rounded-xl border border-black/10 p-4">
                <p className="font-semibold">{product.name}</p>
                <p className="mt-1 text-xs text-black/45">{product.desc}</p>
                <p className="mt-2 font-mono text-[10px] text-black/35">{product.key}</p>
              </div>
            ))}
            <div className="rounded-xl border border-dashed border-black/15 p-4">
              <p className="font-semibold">Bespoke</p>
              <p className="mt-1 text-xs text-black/45">Custom garment, routed to a tailored quote instead of the pricing table.</p>
              <p className="mt-2 font-mono text-[10px] text-black/35">CUSTOM</p>
            </div>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-5 py-4">
            <h2 className="font-semibold">Fabric tiers</h2>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            {FABRICS.map((fabric) => (
              <div key={fabric.key} className="rounded-xl border border-black/10 p-4">
                <p className="font-semibold">{fabric.name}</p>
                <p className="mt-1 text-xs font-medium text-black/50">{fabric.gsm}</p>
                <p className="mt-2 text-xs text-black/45">{fabric.desc}</p>
                <p className="mt-2 font-mono text-[10px] text-black/35">{fabric.key}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-5 py-4">
            <h2 className="font-semibold">Colours</h2>
          </div>
          <div className="flex flex-wrap gap-4 p-5">
            {COLORS.map((color) => (
              <div key={color.key} className="flex items-center gap-3 rounded-xl border border-black/10 px-4 py-3">
                <span
                  className={`h-6 w-6 rounded-full border border-black/10 ${color.key === "BLACK" ? "bg-black" : "bg-white"}`}
                />
                <span className="text-sm font-semibold">{color.name}</span>
              </div>
            ))}
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-black/15 px-4 py-3">
              <span className="text-sm font-semibold text-black/50">Custom colour</span>
              <span className="text-xs text-black/35">Bespoke request</span>
            </div>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
            <h2 className="font-semibold">Placements</h2>
            <Link href="/admin/pricing" className="text-xs font-semibold text-black/45">Edit placement prices →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-[#f8f8f8] text-[11px] uppercase tracking-wider text-black/35">
                <tr><th className="px-5 py-4">Placement</th><th className="px-5 py-4">Price modifier</th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {PLACEMENTS.map((placement) => {
                  const price = placementPriceByKey.get(placement);
                  return (
                    <tr key={placement}>
                      <td className="px-5 py-4 font-semibold">{placementLabel(placement)}</td>
                      <td className="px-5 py-4">
                        {price !== undefined ? (
                          <span className="font-semibold">+{price.toFixed(2)}</span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-700">NOT PRICED</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-5 py-4">
            <h2 className="font-semibold">Base pricing coverage</h2>
            <p className="mt-1 text-xs text-black/40">Quantity-tier pricing rules configured per product × fabric combination.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-[#f8f8f8] text-[11px] uppercase tracking-wider text-black/35">
                <tr><th className="px-5 py-4">Product</th><th className="px-5 py-4">Fabric</th><th className="px-5 py-4">Quantity tiers priced</th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {PRODUCTS.flatMap((product) =>
                  FABRICS.map((fabric) => {
                    const count = ruleCountByCombo.get(`${product.key}:${fabric.key}`) ?? 0;
                    return (
                      <tr key={`${product.key}:${fabric.key}`}>
                        <td className="px-5 py-4 font-semibold">{product.name}</td>
                        <td className="px-5 py-4">{fabric.name}</td>
                        <td className="px-5 py-4">
                          {count > 0 ? (
                            <span className="font-semibold">{count} rule{count === 1 ? "" : "s"}</span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-700">NO RULES — checks fallback pricing</span>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
