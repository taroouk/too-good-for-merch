"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

const GENERIC_ERROR = "Invalid credentials, or this account doesn't have admin access.";

export default function AdminLoginClient({ callbackUrl, denied }: { callbackUrl: string; denied: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", { redirect: false, email, password });
      if (!result || result.error) {
        setError(GENERIC_ERROR);
        return;
      }
      // Credentials were right -- but only let admins through this door. A
      // regular customer who types their password here is signed straight
      // back out so this page never leaves a customer session behind.
      const check = await fetch("/api/admin/me", { cache: "no-store" });
      if (!check.ok) {
        await signOut({ redirect: false });
        setError(GENERIC_ERROR);
        return;
      }
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-admin-canvas px-4 py-10 text-admin-ink">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[.22em] text-admin-faint">Too Good For Merch</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Admin sign in</h1>
          <p className="mt-2 text-sm text-admin-muted">Restricted area. Authorized staff only.</p>
        </div>

        <div className="rounded-2xl border border-admin-border bg-white p-6 shadow-sm sm:p-7">
          {denied ? (
            <div role="alert" className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">This account doesn&apos;t have admin access.</p>
              <p className="mt-1 text-xs leading-5">Sign out and use an admin account, or ask an existing admin to add you.</p>
              <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })} className="mt-3 text-xs font-semibold underline">
                Sign out
              </button>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block text-sm font-medium">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="username"
                autoFocus
                className="mt-2 h-11 w-full rounded-xl border border-admin-border-strong px-4 text-sm outline-none focus:border-admin-ink"
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                className="mt-2 h-11 w-full rounded-xl border border-admin-border-strong px-4 text-sm outline-none focus:border-admin-ink"
              />
            </label>

            {error ? (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-admin-ink text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <a href="/forgot-password" className="block text-center text-xs font-semibold text-admin-muted underline">
              Forgot password?
            </a>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-admin-faint">Not an admin? This isn&apos;t the customer login.</p>
      </div>
    </main>
  );
}
