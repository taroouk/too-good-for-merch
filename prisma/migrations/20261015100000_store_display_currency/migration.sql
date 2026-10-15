-- Customer-facing display currency (admin selectable). Additive only.
ALTER TABLE "StoreSetting" ADD COLUMN "displayCurrency" TEXT NOT NULL DEFAULT 'USD';
