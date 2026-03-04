"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "@/src/components/AuthShell";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { status } = useSession();

  const callbackUrl = useMemo(() => {
    return searchParams?.get("callbackUrl") || "/studio";
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
      callbackUrl,
    });

    setLoading(false);

    if (!res) return setError("Unknown error");
    if (res.error) return setError("Invalid email or password");

    router.replace(res.url || callbackUrl);
  }

  return (
    <AuthShell
      title="Login"
      subtitle="Enter your credentials to access the studio."
      footer={
        <div>
          Don’t have an account? <a className="authLink" href="/register">Create one</a>
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
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>

        {error && <div className="errorBox">{error}</div>}

        <div className="smallNote">
          After signing in you’ll be redirected to: <b>{callbackUrl}</b>
        </div>
      </form>
    </AuthShell>
  );
}