"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginClient() {
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

    await signIn("credentials", {
      email,
      password,
      redirect: true,
      callbackUrl,
    });

    setPending(false);
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24 }}>
      <h1 style={{ fontSize: 64, fontWeight: 900, letterSpacing: -1 }}>
        LOGIN
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
            Password
          </span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            autoComplete="current-password"
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
          {pending ? "Logging in..." : "Login"}
        </button>

        <a
          href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 2, opacity: 0.7 }}
        >
          Create account
        </a>
      </form>
    </main>
  );
}