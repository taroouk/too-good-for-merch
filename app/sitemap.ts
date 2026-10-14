import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim() || "").replace(/\/+$/, "");
  if (!base) return [];
  return ["", "/contact", "/legal/terms", "/legal/privacy", "/legal/refunds"].map((path) => ({ url: `${base}${path}` }));
}
