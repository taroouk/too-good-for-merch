export default function ContactPage() {
    return (
      <main style={{ minHeight: "100vh", padding: 24, display: "grid", placeItems: "center" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 1100,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <h1 className="font-head" style={{ margin: 0, fontSize: 56, lineHeight: 1 }}>
            YOUR<br />BEST DROP<br />STARTS HERE
          </h1>
  
          <div style={{ fontSize: 12, display: "grid", gap: 6, alignContent: "start" }}>
            <a href="mailto:hello@toogoodformerch.com" style={{ textDecoration: "none" }}>
              hello@toogoodformerch.com
            </a>
  
            <a href="https://wa.me/201118399923" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              WhatsApp: +20 111 839 9923
            </a>
          </div>
        </div>
      </main>
    );
  }