export type PriceResult =
  | {
      mode: "standard";
      unit: number;
      total: number;
      currency: "EGP";
    }
  | {
      mode: "custom" | "bulk";
      unit: null;
      total: null;
      currency: "EGP";
      message: string;
    };

const GOOGLE_SHEET_JSON_LINK =
  "https://docs.google.com/spreadsheets/d/1UVKygcyZkYFG43B0ow6qL93MpJ6jLl6C1f0WqPHk0ik/gviz/tq?tqx=out:json";

export async function computePrice({
  product,
  fabric,
  quantity,
}: {
  product: string | null;
  fabric: string | null;
  quantity: number;
}): Promise<PriceResult> {
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));

  if (product === "CUSTOM") {
    return {
      mode: "custom",
      unit: null,
      total: null,
      currency: "EGP",
      message: "Custom garments require a tailored quote.",
    };
  }

  if (qty >= 501) {
    return {
      mode: "bulk",
      unit: null,
      total: null,
      currency: "EGP",
      message: "We will contact you for pricing",
    };
  }

  if (!product || !fabric) {
    return {
      mode: "custom",
      unit: null,
      total: null,
      currency: "EGP",
      message: "Select product and fabric",
    };
  }

  try {
    const res = await fetch(GOOGLE_SHEET_JSON_LINK, { cache: "no-store" });
    const text = await res.text();

    const json = JSON.parse(text.substring(47).slice(0, -2));

    const rows = json.table.rows.map((r: any) =>
      r.c.map((c: any) => c?.v ?? "")
    );

    const match = rows.find((r: any[]) => {
      const rowProduct = String(r[0]).trim();
      const rowFabric = String(r[1]).trim();
      const min = Number(r[2]);
      const max = Number(r[3]);

      return (
        rowProduct === product &&
        rowFabric === fabric &&
        qty >= min &&
        qty <= max
      );
    });

    if (!match) {
      return {
        mode: "custom",
        unit: null,
        total: null,
        currency: "EGP",
        message: "No pricing found",
      };
    }

    const unit = Number(match[4]);

    return {
      mode: "standard",
      unit,
      total: unit * qty,
      currency: "EGP",
    };
  } catch {
    return {
      mode: "custom",
      unit: null,
      total: null,
      currency: "EGP",
      message: "Pricing error",
    };
  }
}