// Built-in price list: the quantity ranges the studio quotes in and the default
// USD unit price for each product/fabric/range. Pure data, shared by the pricing
// engine (src/pricing/engine.ts) and the admin price grid, so the admin always
// sees the exact figures a customer would be charged when no PricingRule
// overrides them.

export const RANGES = [
  [1, 10], [11, 30], [31, 50], [51, 80], [81, 100],
  [101, 150], [151, 200], [201, 300], [301, 400], [401, 500],
] as const;

// USD unit prices (see PRICING_CURRENCY below). Emergency/default fallback
// only, used exclusively when no PricingRule row matches -- see
// computePrice()'s resolution order.
export const FALLBACK_PRICES: Record<string, Record<string, number[]>> = {
  FITTED: {
    ESSENTIALS_170: [8.02, 7.83, 7.44, 7.25, 6.87, 6.49, 5.92, 5.54, 4.96, 4.58],
    SIGNATURE_200: [9.54, 9.16, 8.4, 7.83, 7.25, 6.87, 6.3, 5.92, 5.34, 4.96],
  },
  OVERSIZED: {
    ESSENTIALS_170: [8.4, 8.21, 7.83, 7.64, 7.25, 6.87, 6.3, 5.92, 5.34, 4.96],
    SIGNATURE_200: [9.93, 9.54, 8.78, 8.21, 7.64, 7.25, 6.68, 6.3, 5.73, 5.34],
    HEAVYWEIGHT_300: [12.41, 11.07, 10.31, 9.73, 9.16, 8.78, 8.21, 7.83, 7.25, 6.87],
  },
};

