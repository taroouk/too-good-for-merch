import Link from "next/link";

export default function StudioPlaceholderPage() {
  return (
    <main style={{ minHeight: "100vh", padding: 24, display: "grid", placeItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 800 }}>
        <h1 className="font-head" style={{ fontSize: 56, margin: 0 }}>
          ENTER<br />STUDIO
        </h1>

        <div style={{ marginTop: 16, height: 260, background: "#e5e5e5" }} />

        <p style={{ marginTop: 12, fontSize: 12 }}>
          Placeholder for Phase 2. Studio logic will be implemented in later phases.
        </p>

        <Link href="/" style={{ fontSize: 12, textDecoration: "underline" }}>
          Back to home
        </Link>
      </div>
    </main>
  );
}