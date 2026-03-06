"use client";

import "../auth.css";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function RegisterClient() {
  const sp = useSearchParams();
  const callbackUrl = useMemo(() => sp.get("callbackUrl") ?? "/studio", [sp]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!r.ok) {
      const data = await r.json().catch(() => null);
      setError(data?.error ?? "Registration failed");
      setPending(false);
      return;
    }

    // auto login
    await signIn("credentials", { email, password, redirect: true, callbackUrl });
    setPending(false);
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <div className="authGrid">
          <div className="leftPane">
            <div className="kicker">Too Good For Merch</div>
            <h1 className="h1">CREATE ACCOUNT</h1>
            <p className="p">
              Create your account then we’ll sign you in automatically and send you to the studio.
            </p>

            <div className="smallNote">
              Password must be at least <b>8</b> characters.
            </div>
          </div>

          <div className="rightPane">
            <form className="form" onSubmit={onSubmit}>
              <label className="label">
                <span className="labelText">Email</span>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@email.com"
                />
              </label>

              <label className="label">
                <span className="labelText">Password</span>
                <input
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  placeholder="min 8 chars"
                />
              </label>

              {error ? <div className="error">{error}</div> : null}

              <div className="btnRow">
                <button className="btn" type="submit" disabled={pending}>
                  {pending ? "Creating..." : "Create"}
                </button>

                <a className="link" href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
                  Back to login
                </a>
              </div>

              <a className="link" href="/">
                Back to home
              </a>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}