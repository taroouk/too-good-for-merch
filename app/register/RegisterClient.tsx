"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function RegisterClient() {
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") ?? "/studio";

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

    await signIn("credentials", { email, password, redirect: true, callbackUrl });
    setPending(false);
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24 }}>
      <h1 style={{ fontSize: 64, fontWeight: 900, letterSpacing: -1 }}>
        CREATE ACCOUNT
      </h1>

      <form onSubmit={onSubmit} style={{ marginTop: 24, maxWidth: 420, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, opacity: 0.7 }}>
            Email
          </span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="email"
            style={{ height: 44, border: "1px solid #00000033", padding: "0 12px" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, opacity: 0.7 }}>
            Password (min 8)
          </span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
            style={{ height: 44, border: "1px solid #00000033", padding: "0 12px" }}
          />
        </label>

        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          style={{
            height: 44,
            border: "1px solid black",
            background: "black",
            color: "white",
            padding: "0 16px",
            width: "fit-content",
            textTransform: "uppercase",
            letterSpacing: 2,
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "Creating..." : "Create"}
        </button>

        <a
          href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, opacity: 0.7 }}
        >
          Back to login
        </a>
      </form>
    </main>
  );
}