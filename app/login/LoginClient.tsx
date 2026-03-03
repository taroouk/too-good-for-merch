"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const callbackUrl = useMemo(() => {
    return searchParams.get("callbackUrl") || "/studio";
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ لو المستخدم already logged in → روح الاستوديو
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/studio");
    }
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      redirect: false, // مهم جداً
      email,
      password,
      callbackUrl,
    });

    setLoading(false);

    if (!res) {
      setError("No response from server");
      return;
    }

    if (res.error) {
      setError("Wrong email or password");
      return;
    }

    // ✅ تحويل مضمون بعد نجاح اللوجين
    router.replace(res.url || "/studio");
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Login</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gap: 12,
          width: 300,
        }}
      >
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>

        {error && <div style={{ color: "crimson" }}>{error}</div>}
      </form>
    </div>
  );
}