-- Own migration: PostgreSQL won't let a freshly added enum value be used in
-- the same transaction, and keeping it separate keeps the rest simple.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SHIPPED';
