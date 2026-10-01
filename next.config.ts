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
    // same-origin or inlined by Next itself, so a strict self-only CSP is
    // safe here. The one external browser-facing host is Paymob's hosted
    // card form, which /checkout embeds in an <iframe> (frame-src below). 'unsafe-inline' is required
    // for Next's inline bootstrap/style tags; 'unsafe-eval' is dev-only
    // (needed by the dev-mode React refresh runtime, not shipped to prod).
    const isProduction = process.env.NODE_ENV === "production";
    const cspDirectives = (frameAncestors: string) => [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self'",
      "connect-src 'self'",
      "media-src 'self'",
      "frame-src https://accept.paymob.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      `frame-ancestors ${frameAncestors}`,
      ...(isProduction ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
    const csp = cspDirectives("'none'");

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
      // Paymob's response callback (see app/api/payments/paymob/verify)
      // loads inside the embedded card iframe on /checkout, so it alone may
      // be framed -- by our own origin only. Later entries override the
      // same header keys set above.
      {
        source: "/api/payments/paymob/verify",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: cspDirectives("'self'") },
        ],
      },
    ];
  },
};

export default nextConfig;
