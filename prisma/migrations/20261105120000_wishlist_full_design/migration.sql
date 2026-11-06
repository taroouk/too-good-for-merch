-- Wishlist keeps the whole design (layers, crop/zoom, mockups). Additive only.
ALTER TABLE "WishlistItem" ADD COLUMN "design" JSONB;
