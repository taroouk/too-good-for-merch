import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  experimental: {
    // Builder artwork uploads go through a Server Action
    // (actionCreateAssetForBuilder / actionCreateAsset), and the client +
    // src/lib/storage.ts already allow files up to MAX_ARTWORK_BYTES (10MB).
    // Next's default Server Action body limit is 1MB, so any artwork over
    // 1MB was rejected with a 413 before the action ran -- the upload
    // promise rejected and the optimistic preview silently vanished. Lift
    // the limit past the 10MB artwork cap (plus multipart overhead).
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    // Everything the app renders (images, fonts, scripts, styles) is
    // same-origin or inlined by Next itself -- there are no external
    // browser-facing hosts (Paymob/Prisma/etc. are server-to-server only) --
    // so a strict self-only CSP is safe here. 'unsafe-inline' is required
    // for Next's inline bootstrap/style tags; 'unsafe-eval' is dev-only
    // (needed by the dev-mode React refresh runtime, not shipped to prod).
    const isProduction = process.env.NODE_ENV === "production";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self'",
      "connect-src 'self'",
      "media-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(isProduction ? ["upgrade-insecure-requests"] : []),
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
