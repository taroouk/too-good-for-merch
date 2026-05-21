"use client";

import "../auth.css";
import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

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

  // لو already logged in -> روح للـStudio
  useEffect(() => {
    if (status === "authenticated") router.replace(callbackUrl);
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
    <main className="authShell">
      <section className="authCard">
        <div className="authGrid">
          <div className="leftPane">
            <div className="kicker">Too Good For Merch</div>
            <h1 className="h1">ENTER STUDIO</h1>
            <p className="p">
              Login to access your studio. Your session is protected and the /studio route is guarded by middleware.
            </p>
          </div>

          <div className="rightPane">
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

              <label className="label">
                <span className="labelText">Password</span>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>

              {error ? <div className="error">{error}</div> : null}

              <div className="btnRow">
                <button className="btn" type="submit" disabled={loading}>
                  {loading ? "Logging in..." : "Login"}
                </button>

                <a className="link" href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
                  Create account
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