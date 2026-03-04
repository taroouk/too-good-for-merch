"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { status } = useSession();

  const callbackUrl = useMemo(() => {
    // مهم: لو callbackUrl جاي URL كامل من next-auth سيبه زي ما هو
    return searchParams?.get("callbackUrl") || "/studio";
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // لو already logged in -> روح للـStudio
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
      router.refresh();
    }
  }, [status, callbackUrl, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      redirect: false,
      email: email.toLowerCase().trim(),
      password,
      callbackUrl,
    });

    setLoading(false);

    if (!res) {
      setError("Unknown error");
      return;
    }

    if (res.error) {
      setError("Invalid email or password");
      return;
    }

    // نجاح: لازم refresh عشان /studio (Server Component) يشوف session الجديد
    router.replace(callbackUrl);
    router.refresh();
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Login</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, maxWidth: 320 }}>
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>

        {error && <div style={{ color: "crimson" }}>{error}</div>}
      </form>
    </div>
  );
}