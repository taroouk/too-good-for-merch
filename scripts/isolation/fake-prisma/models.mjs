// Schema description for the Fake Prisma engine: ONLY the models the Studio/Builder path touches.
// Mirrors prisma/schema.prisma (field names, defaults, relations, uniques, onDelete). Any model not listed
// here is rejected loudly by the engine. No Prisma runtime is imported anywhere in this directory.
//
// Field spec string: "<type>[?][=<default>]"
//   types: string int float bool date json bytes enum:<Name>
//   defaults: cuid | now | updatedAt | true | false | <number> | <literal text>
// Relations: kind "one" (this model holds the fk -> target pk), "one-back" (target holds the fk, at most one row),
//            "many" (target holds the fk). onDelete applies to the fk-owning ("one") side.

export const ENUMS = {
  Role: ["ADMIN", "USER"],
  BuildStatus: ["ACTIVE", "ARCHIVED"],
  ProductType: ["FITTED", "OVERSIZED", "CUSTOM"],
  GarmentColor: ["BLACK", "WHITE", "CUSTOM"],
  AssetStatus: ["PENDING_UPLOAD", "READY", "FAILED"],
  MockupKind: ["PRINT", "AI"],
  OrderStatus: ["NEW", "PAID", "IN_PRODUCTION", "SHIPPED", "COMPLETED", "CANCELLED"],
  PaymentStatus: ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"],
  PaymentMethod: ["CARD", "WALLET"],
  PaymentAttemptStatus: ["CREATED", "PENDING", "SUCCEEDED", "FAILED"],
  PlacementType: ["LEFT_CHEST", "RIGHT_CHEST", "RIGHT_SLEEVE", "LEFT_SLEEVE", "CENTER_FRONT", "FULL_FRONT", "CENTER_BACK", "FULL_BACK"],
};

const ts = { createdAt: "date=now", updatedAt: "date=updatedAt" };

export const MODELS = {
  User: {
    pk: "id",
    fields: { id: "string=cuid", email: "string?", createdAt: "date=now", phone: "string?", updatedAt: "date=updatedAt", passwordHash: "string?", role: "enum:Role=USER", blockedAt: "date?" },
    unique: [["email"], ["phone"]],
    relations: {
      builds: { to: "Build", kind: "many", fk: "userId" },
      artworks: { to: "Artwork", kind: "many", fk: "userId" },
      wishlistItems: { to: "WishlistItem", kind: "many", fk: "userId" },
      bagItems: { to: "BagItem", kind: "many", fk: "userId" },
      orders: { to: "Order", kind: "many", fk: "userId" },
    },
  },
  Build: {
    pk: "id",
    fields: { id: "string=cuid", ...ts, name: "string?", userId: "string?", status: "enum:BuildStatus=ACTIVE" },
    relations: {
      user: { to: "User", kind: "one", fk: "userId", onDelete: "setnull" },
      draft: { to: "BuildDraft", kind: "one-back", fk: "buildId" },
      assets: { to: "Asset", kind: "many", fk: "buildId" },
      designs: { to: "Design", kind: "many", fk: "buildId" },
      mockups: { to: "Mockup", kind: "many", fk: "buildId" },
      artworks: { to: "Artwork", kind: "many", fk: "buildId" },
      wishlistItems: { to: "WishlistItem", kind: "many", fk: "buildId" },
      bagItems: { to: "BagItem", kind: "many", fk: "buildId" },
      orders: { to: "Order", kind: "many", fk: "buildId" },
    },
  },
  BuildDraft: {
    pk: "id",
    fields: {
      id: "string=cuid", ...ts, buildId: "string", product: "enum:ProductType?", color: "enum:GarmentColor?", fabric: "string?", quantity: "int=1",
      customNotes: "string?", primaryAssetId: "string?",
      printMockupId: "string?", printMockupFingerprint: "string?", printMockupGeneratedAt: "date?",
      aiMockupId: "string?", aiMockupFingerprint: "string?", aiMockupGeneratedAt: "date?",
      savedArtworkId: "string?", artworkPlacement: "json?", artworkLayers: "json?",
      backPrintMockupId: "string?", backPrintMockupFingerprint: "string?", backAiMockupId: "string?", backAiMockupFingerprint: "string?",
      productDesigns: "json?", customQuoteUsdCents: "int?", customQuoteNote: "string?", customQuotedAt: "date?", customQuotedByEmail: "string?",
    },
    unique: [["buildId"]],
    relations: {
      build: { to: "Build", kind: "one", fk: "buildId", onDelete: "cascade" },
      primaryAsset: { to: "Asset", kind: "one", fk: "primaryAssetId", onDelete: "setnull" },
      printMockup: { to: "Mockup", kind: "one", fk: "printMockupId", onDelete: "setnull" },
      aiMockup: { to: "Mockup", kind: "one", fk: "aiMockupId", onDelete: "setnull" },
      savedArtwork: { to: "Artwork", kind: "one", fk: "savedArtworkId", onDelete: "setnull" },
    },
  },
  Mockup: {
    pk: "id",
    fields: {
      id: "string=cuid", ...ts, kind: "enum:MockupKind=AI", parentId: "string?", width: "int?", height: "int?", buildId: "string", assetId: "string?",
      mimeType: "string?", data: "bytes", sha256: "string?", model: "string?", placement: "string?", fingerprint: "string?", prompt: "string?",
    },
    relations: {
      build: { to: "Build", kind: "one", fk: "buildId", onDelete: "cascade" },
      printDrafts: { to: "BuildDraft", kind: "many", fk: "printMockupId" },
      aiDrafts: { to: "BuildDraft", kind: "many", fk: "aiMockupId" },
    },
  },
  Asset: {
    pk: "id",
    fields: {
      id: "string=cuid", ...ts, buildId: "string", status: "enum:AssetStatus=PENDING_UPLOAD", fileName: "string", mimeType: "string?", sizeBytes: "int?",
      uploadedAt: "date=now", artworkData: "bytes?", artworkSha256: "string?", storageKey: "string?", url: "string?", hiddenAt: "date?",
      cropSourceAssetId: "string?", cropMeta: "json?",
    },
    relations: {
      build: { to: "Build", kind: "one", fk: "buildId", onDelete: "cascade" },
      usedAsPrimaryIn: { to: "BuildDraft", kind: "many", fk: "primaryAssetId" },
      placements: { to: "DesignPlacement", kind: "many", fk: "assetId" },
      orderItems: { to: "OrderItem", kind: "many", fk: "assetId" },
    },
  },
  Design: {
    pk: "id",
    fields: { id: "string=cuid", ...ts, buildId: "string", name: "string?" },
    relations: {
      build: { to: "Build", kind: "one", fk: "buildId", onDelete: "cascade" },
      placements: { to: "DesignPlacement", kind: "many", fk: "designId" },
    },
  },
  DesignPlacement: {
    pk: "id",
    fields: { id: "string=cuid", createdAt: "date=now", designId: "string", placement: "enum:PlacementType", assetId: "string" },
    unique: [["designId", "placement"]],
    relations: {
      asset: { to: "Asset", kind: "one", fk: "assetId", onDelete: "restrict" },
      design: { to: "Design", kind: "one", fk: "designId", onDelete: "cascade" },
    },
  },
  Order: {
    pk: "id",
    fields: {
      id: "string=cuid", ...ts, userId: "string?", buildId: "string?", currency: "string=EGP", customerEmail: "string?", customerName: "string?", customerPhone: "string?",
      shippingCountry: "string?", shippingCity: "string?", shippingRegion: "string?", shippingAddressLine1: "string?", shippingAddressLine2: "string?", shippingPostalCode: "string?",
      orderNumber: "string", paymentStatus: "enum:PaymentStatus=UNPAID", paymentMethod: "enum:PaymentMethod?", paymentUrl: "string?", paymobIntentionId: "string?", paymobOrderId: "string?",
      paymobTransactionId: "string?", paymentFailureReason: "string?", paidAt: "date?", confirmationEmailSentAt: "date?", termsAcceptedAt: "date?", termsVersion: "string?",
      carrier: "string?", trackingNumber: "string?", trackingUrl: "string?", shippedAt: "date?", refundedAt: "date?",
      subtotalCents: "int", totalCents: "int", canonicalTotalUsdCents: "int?", exchangeRateUsed: "float?", exchangeRateAt: "date?", status: "enum:OrderStatus=NEW",
    },
    unique: [["orderNumber"]],
    relations: {
      build: { to: "Build", kind: "one", fk: "buildId", onDelete: "setnull" },
      user: { to: "User", kind: "one", fk: "userId", onDelete: "setnull" },
      items: { to: "OrderItem", kind: "many", fk: "orderId" },
      paymentAttempts: { to: "PaymentAttempt", kind: "many", fk: "orderId" },
      // used by the admin order page (include notes / auditLogs) and the system-health count (auditLogs.some)
      notes: { to: "AdminNote", kind: "many", fk: "orderId" },
      auditLogs: { to: "AdminAuditLog", kind: "many", fk: "orderId" },
    },
  },
  OrderItem: {
    pk: "id",
    fields: {
      id: "string=cuid", createdAt: "date=now", orderId: "string", assetId: "string?", color: "enum:GarmentColor", fabric: "string", placements: "json", preview: "json?",
      product: "enum:ProductType", quantity: "int", totalCents: "int", unitPriceCents: "int",
    },
    relations: {
      asset: { to: "Asset", kind: "one", fk: "assetId", onDelete: "setnull" },
      order: { to: "Order", kind: "one", fk: "orderId", onDelete: "cascade" },
    },
  },
  // Needed by recordCheckoutFailure (src/lib/orders/checkout-failure.ts:21). bespokeRequestId is a plain column here
  // (BespokeRequest is not modelled), so no foreign key is enforced for it.
  AdminAuditLog: {
    pk: "id",
    fields: {
      id: "string=cuid", createdAt: "date=now", adminId: "string?", orderId: "string?", bespokeRequestId: "string?", action: "string",
      previousValue: "string?", newValue: "string?", metadata: "json?",
    },
    relations: {
      admin: { to: "User", kind: "one", fk: "adminId", onDelete: "setnull" },
      order: { to: "Order", kind: "one", fk: "orderId", onDelete: "setnull" },
    },
  },
  // Webhook path (app/api/payments/paymob/webhook/route.ts): one row per delivery, idempotency by the unique eventKey.
  WebhookEvent: {
    pk: "id",
    fields: {
      id: "string=cuid", createdAt: "date=now", eventKey: "string", eventType: "string", transactionId: "string?", validSignature: "bool", processed: "bool=false",
      processedAt: "date?", errorMessage: "string?", payload: "json", orderId: "string?",
    },
    unique: [["eventKey"]],
    relations: { order: { to: "Order", kind: "one", fk: "orderId", onDelete: "setnull" } },
  },
  AdminNote: {
    pk: "id",
    fields: { id: "string=cuid", createdAt: "date=now", orderId: "string", authorId: "string?", body: "string" },
    relations: {
      order: { to: "Order", kind: "one", fk: "orderId", onDelete: "cascade" },
      author: { to: "User", kind: "one", fk: "authorId", onDelete: "setnull" },
    },
  },
  // Terms / Refund pages (src/lib/legal.ts currentTermsVersion reads their updatedAt).
  LegalPage: {
    pk: "slug",
    fields: { slug: "string", title: "string", body: "string", updatedByEmail: "string?", updatedAt: "date=updatedAt" },
    relations: {},
  },
  PaymentAttempt: {
    pk: "id",
    fields: {
      id: "string=cuid", ...ts, orderId: "string", provider: "string=PAYMOB", method: "enum:PaymentMethod", status: "enum:PaymentAttemptStatus=CREATED", amountCents: "int",
      currency: "string", externalId: "string?", paymentUrl: "string?", failureReason: "string?", metadata: "json?",
    },
    relations: { order: { to: "Order", kind: "one", fk: "orderId", onDelete: "cascade" } },
  },
  Artwork: {
    pk: "id",
    fields: { id: "string=cuid", ...ts, userId: "string?", buildId: "string?", sourceMockupId: "string?", mimeType: "string", data: "bytes", sha256: "string", model: "string?", prompt: "string?" },
    unique: [["sourceMockupId"]],
    relations: {
      user: { to: "User", kind: "one", fk: "userId", onDelete: "setnull" },
      build: { to: "Build", kind: "one", fk: "buildId", onDelete: "setnull" },
      draftsUsingAsSaved: { to: "BuildDraft", kind: "many", fk: "savedArtworkId" },
      wishlistItems: { to: "WishlistItem", kind: "many", fk: "artworkId" },
    },
  },
  WishlistItem: {
    pk: "id",
    fields: {
      id: "string=cuid", ...ts, userId: "string", buildId: "string", artworkId: "string?", product: "enum:ProductType?", color: "enum:GarmentColor?", fabric: "string?",
      quantity: "int=1", size: "string?", placements: "json", transform: "json?", design: "json?",
    },
    unique: [["userId", "buildId"]],
    relations: {
      user: { to: "User", kind: "one", fk: "userId", onDelete: "cascade" },
      build: { to: "Build", kind: "one", fk: "buildId", onDelete: "cascade" },
      artwork: { to: "Artwork", kind: "one", fk: "artworkId", onDelete: "setnull" },
    },
  },
  BagItem: {
    pk: "id",
    fields: { id: "string=cuid", ...ts, userId: "string", buildId: "string", size: "string=M" },
    unique: [["userId", "buildId"]],
    relations: {
      user: { to: "User", kind: "one", fk: "userId", onDelete: "cascade" },
      build: { to: "Build", kind: "one", fk: "buildId", onDelete: "cascade" },
    },
  },
  StoreSetting: {
    pk: "id",
    fields: { id: "string=store", storeName: "string=Too Good For Merch", currency: "string=USD", taxRateBps: "int=0", shippingCents: "int=0", usdToEgpRate: "float?", displayCurrency: "string=USD", updatedAt: "date=updatedAt" },
    relations: {},
  },
  CatalogFabric: {
    pk: "id",
    fields: { id: "string=cuid", key: "string", name: "string", gsm: "string", description: "string", sortOrder: "int=0", active: "bool=true", ...ts },
    unique: [["key"]],
    relations: {},
  },
  CatalogProduct: {
    pk: "product",
    fields: { product: "string", name: "string", tagline: "string", updatedAt: "date=updatedAt" },
    relations: {},
  },
  CatalogPause: {
    pk: "id",
    fields: { id: "string=cuid", product: "string", fabric: "string", reason: "string?", createdAt: "date=now" },
    unique: [["product", "fabric"]],
    relations: {},
  },
  PricingRule: {
    pk: "id",
    fields: { id: "string=cuid", product: "string", fabric: "string", minQty: "int", maxQty: "int", unitPrice: "float", ...ts },
    relations: {},
  },
  PlacementPricingRule: {
    pk: "id",
    fields: { id: "string=cuid", placement: "enum:PlacementType", unitPrice: "float", ...ts },
    unique: [["placement"]],
    relations: {},
  },
  RateLimitBucket: {
    pk: "key",
    fields: { key: "string", count: "int", resetAt: "date" },
    relations: {},
  },
};
