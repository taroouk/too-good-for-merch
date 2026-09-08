-- CreateIndex
-- P2-5: speeds up the webhook handler's lookup of an Order by paymobOrderId
-- (app/api/payments/paymob/webhook/route.ts), which previously had no index
-- and forced a full table scan on every delivery. Deliberately a plain
-- index, not UNIQUE -- see the comment on Order.paymobOrderId in
-- schema.prisma for why a unique constraint isn't safe here, and because a
-- non-unique index can never fail to apply against existing data the way a
-- unique one could if any rows already share a value.
CREATE INDEX "Order_paymobOrderId_idx" ON "Order"("paymobOrderId");
