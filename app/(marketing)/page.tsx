import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        display: "grid",
        gap: 20,
        alignContent: "start",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div className="font-head" style={{ fontSize: 18, letterSpacing: 0.5 }}>
          TOO GOOD FOR MERCH
        </div>

        <nav style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <Link href="/portfolio" style={{ textDecoration: "none" }}>
            SELECTED WORK
          </Link>
          <Link href="/contact" style={{ textDecoration: "none" }}>
            CONTACT
          </Link>
        </nav>
      </header>

      {/* Hero image placeholder */}
      <section
        style={{
          height: 360,
          border: "1px solid #000",
          background: "#e9e9e9",
        }}
      />

      {/* Bottom bar */}
      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <p style={{ margin: 0, fontSize: 12, maxWidth: 520 }}>
          for artists. events. brands. that take merch seriously
        </p>

        {/* Dominant CTA */}
        <Link
          href="/studio"
          className="font-head"
          style={{
            textDecoration: "none",
            border: "1px solid #000",
            padding: "16px 22px",
            fontSize: 14,
            letterSpacing: 1,
            display: "inline-block",
          }}
        >
          ENTER STUDIO →
        </Link>
      </section>
    </main>
  );
}