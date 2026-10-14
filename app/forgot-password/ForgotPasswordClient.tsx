"use client";

import "../auth.css";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
            <h1 className="h1">FORGOT PASSWORD</h1>
            <p className="p">Enter the email you registered with and we&apos;ll send you a link to set a new password.</p>
          </div>

          <div className="rightPane">
            {done ? (
              <div className="form">
                <p className="p" role="status">
                  If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in 1 hour. Check your spam folder if you don&apos;t see it.
                </p>
                <Link className="link" href="/login">
                  Back to login
                </Link>
              </div>
            ) : (
              <form className="form" onSubmit={onSubmit}>
                <label className="label">
                  <span className="labelText">Email</span>
                  <input
                    className="input"
                    type="email"
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </label>

                {error ? <div className="error">{error}</div> : null}

                <div className="btnRow">
                  <button className="btn" type="submit" disabled={loading}>
                    {loading ? "Sending..." : "Send reset link"}
                  </button>
                </div>

                <Link className="link" href="/login">
                  Back to login
                </Link>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
