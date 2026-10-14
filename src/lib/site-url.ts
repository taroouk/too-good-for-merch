// The public origin used to build absolute links in emails. Prefers the
// explicit public URL, then NEXTAUTH_URL; falls back to localhost in dev.
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim() || "";
  const base = raw.replace(/\/+$/, "");
  if (base) return base;
  return process.env.NODE_ENV === "production" ? "" : "http://localhost:3000";
}
