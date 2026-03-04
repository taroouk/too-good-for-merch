"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import AuthShell from "@/src/components/AuthShell";

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

    // auto login after register
    await signIn("credentials", {
      email,
      password,
      redirect: true,
      callbackUrl,
    });

    setPending(false);
  }

  return (
    <AuthShell
      title="Create Account"
      subtitle="Register to access your private studio."
      footer={
        <div>
          Already have an account?{" "}
          <a className="authLink" href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
            Login
          </a>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="formGrid">
        <div>
          <div className="labelRow">
            <span className="fieldLabel">Email</span>
          </div>
          <input
            className="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div>
          <div className="labelRow">
            <span className="fieldLabel">Password</span>
          </div>
          <input
            className="input"
            type="password"
            placeholder="Minimum 8 characters"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>

        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create Account"}
        </button>

        {error && <div className="errorBox">{error}</div>}
      </form>
    </AuthShell>
  );
}