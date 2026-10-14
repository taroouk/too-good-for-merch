"use client";

import "../auth.css";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function ResetPasswordClient() {
  const params = useSearchParams();
  const token = params?.get("token") ?? "";
  const email = params?.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkMissing = !token || !email;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      if (res.ok) setDone(true);
      else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <div className="authGrid">
          <div className="leftPane">
            <div className="kicker">Too Good For Merch</div>
            <h1 className="h1">NEW PASSWORD</h1>
            <p className="p">Choose a new password for {email || "your account"}. Use at least 8 characters.</p>
          </div>

          <div className="rightPane">
            {done ? (
              <div className="form">
                <p className="p" role="status">Your password was updated. You can log in now.</p>
                <Link className="btn" href="/login">
                  Go to login
                </Link>
              </div>
            ) : linkMissing ? (
              <div className="form">
                <div className="error">This reset link is incomplete. Request a new one.</div>
                <Link className="link" href="/forgot-password">
                  Request a new link
                </Link>
              </div>
            ) : (
              <form className="form" onSubmit={onSubmit}>
                <label className="label">
                  <span className="labelText">New password</span>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
                <label className="label">
                  <span className="labelText">Confirm password</span>
                  <input
                    className="input"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>

                {error ? <div className="error">{error}</div> : null}

                <div className="btnRow">
                  <button className="btn" type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Update password"}
                  </button>
                  <Link className="link" href="/forgot-password">
                    Need a new link?
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
