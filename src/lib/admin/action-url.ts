// Pure URL helper for admin server actions (no Next/Prisma imports so it
// can be unit tested with the plain-tsc runner). Admin actions finish by
// redirecting back to a page with a one-shot `notice` (success) or `error`
// (failure) query param.

const DUMMY_ORIGIN = "http://admin.local";

// Only same-origin /admin paths are ever allowed as a return target, so a
// forged hidden `returnTo` field can't turn an action into an open redirect.
export function safeAdminPath(candidate: unknown, fallback: string): string {
  if (typeof candidate !== "string") return fallback;
  if (!candidate.startsWith("/admin") || candidate.startsWith("//") || candidate.includes("\\")) return fallback;
  if (candidate.length > 500) return fallback;
  if (candidate !== "/admin" && !candidate.startsWith("/admin/") && !candidate.startsWith("/admin?")) return fallback;
  return candidate;
}

export function withFlash(path: string, kind: "notice" | "error", message: string): string {
  const url = new URL(path, DUMMY_ORIGIN);
  url.searchParams.delete("notice");
  url.searchParams.delete("error");
  url.searchParams.set(kind, message.slice(0, 300));
  return `${url.pathname}${url.search}`;
}
