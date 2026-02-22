import Link from "next/link";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", padding: 24 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Link
          href="/"
          className="font-head"
          style={{
            fontSize: 18,
            letterSpacing: 0.5,
            textDecoration: "none",
          }}
        >
          TOO GOOD FOR MERCH
        </Link>

        <nav style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <Link href="/portfolio" style={{ textDecoration: "none" }}>
            SELECTED WORK
          </Link>
          <Link href="/contact" style={{ textDecoration: "none" }}>
            CONTACT
          </Link>
        </nav>
      </header>

      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}