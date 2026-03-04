import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/src/auth";

export default async function StudioPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/studio");
  }

  const email = session.user.email ?? "Unknown";

  return (
    <div style={{ padding: 28 }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "var(--font-league, system-ui)", fontWeight: 700, fontSize: 42, letterSpacing: "-0.02em" }}>
              Studio
            </div>
            <div style={{ color: "rgba(0,0,0,0.6)", marginTop: 6 }}>
              Signed in as <b>{email}</b>
            </div>
          </div>

          <a
            href="/api/auth/signout?callbackUrl=/login"
            style={{
              border: "1px solid rgba(0,0,0,0.18)",
              borderRadius: 12,
              padding: "10px 12px",
              textDecoration: "none",
              color: "rgba(0,0,0,0.85)",
              fontSize: 14,
            }}
          >
            Sign out
          </a>
        </div>

        <div
          style={{
            marginTop: 22,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 18,
            padding: 18,
            background: "rgba(255,255,255,0.8)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(0,0,0,0.6)" }}>
            Session
          </div>
          <pre style={{ marginTop: 10, overflow: "auto" }}>
            {JSON.stringify(session, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}