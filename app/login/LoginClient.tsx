"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function safeCallbackUrl(raw: string | null) {
  // اسمح فقط بروابط نسبية داخل الموقع
  if (!raw) return "/studio";

  // لو جالك absolute url (زي http://localhost...) امنعه
  // وارجع لـ /studio
  if (raw.startsWith("http://") || raw.startsWith("https://")) return "/studio";

  // لازم يبدأ بـ /
  if (!raw.startsWith("/")) return "/studio";

  return raw;
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const callbackUrl = useMemo(() => {
    return safeCallbackUrl(searchParams?.get("callbackUrl"));
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
      email: email.trim().toLowerCase(),
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

    // نجاح
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