import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        overflow: "hidden",
      }}
    >
      {/* Hero fills available space */}
      <section
        style={{
          border: "1px solid #000",
          padding: 18,
          flex: 1,
          minHeight: 0, // مهم عشان flex ما يعملش overflow
          display: "flex",
        }}
      >
        <div style={{ flex: 1, background: "#d9d9d9" }} />
      </section>

      {/* Bottom row stays visible */}
      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <p style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
          for artists. events. brands. that take merch seriously
        </p>

        <Link
          href="/studio"
          className="font-head"
          style={{
            border: "1px solid #000",
            padding: "14px 20px",
            fontSize: 14,
            letterSpacing: 1,
            display: "inline-block",
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          ENTER STUDIO →
        </Link>
      </section>
    </main>
  );
}