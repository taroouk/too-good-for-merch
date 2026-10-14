import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { withFlash } from "src/lib/admin/action-url";

// A failure whose message is safe and useful to show the admin (validation,
// state-machine rejections, "not found"). Anything else thrown inside a
// handler is logged server-side and surfaced as a generic message, so
// internals (SQL, stack traces) never reach the browser -- in production
// Next replaces a thrown server-action error's message with a digest
// anyway, which left admins staring at the generic error boundary.
export class AdminActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminActionError";
  }
}

export type AdminActionResult = string | { notice: string; to?: string };

// Runs an admin action body and ALWAYS finishes with a redirect carrying
// either `?notice=` or `?error=`. The redirect happens outside the
// try/catch so Next's redirect signal is never swallowed. Call
// requireAdmin() BEFORE this (authorization failures must redirect to the
// login page, not become an error toast).
export async function runAdminAction(returnTo: string, handler: () => Promise<AdminActionResult>): Promise<never> {
  let target: string;
  try {
    const result = await handler();
    const notice = typeof result === "string" ? result : result.notice;
    const to = typeof result === "string" ? returnTo : result.to ?? returnTo;
    target = withFlash(to, "notice", notice);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof AdminActionError) {
      target = withFlash(returnTo, "error", error.message);
    } else {
      console.error("[admin-action] unexpected failure", error);
      target = withFlash(returnTo, "error", "Something went wrong. Nothing was changed — please try again.");
    }
  }
  redirect(target);
}

export function formString(formData: FormData, key: string, max = 500): string {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

export function formNumber(formData: FormData, key: string, label: string): number {
  const raw = String(formData.get(key) ?? "").trim();
  const value = Number(raw);
  if (!raw || !Number.isFinite(value)) throw new AdminActionError(`${label} must be a valid number.`);
  return value;
}
