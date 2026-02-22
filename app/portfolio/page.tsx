const items = [
    { title: "PROJECT", meta: "20K printed • T-shirts & hoodies" },
    { title: "PROJECT", meta: "10K printed • Oversized tees" },
    { title: "PROJECT", meta: "5K printed • Event merch" },
    { title: "PROJECT", meta: "2K printed • Artist drop" },
    { title: "PROJECT", meta: "1K printed • Limited run" },
    { title: "PROJECT", meta: "500 printed • Boutique" },
  ];
  
  export default function PortfolioPage() {
    return (
      <main style={{ minHeight: "100vh", padding: 24, display: "grid", gap: 24 }}>
        <header style={{ display: "grid", gap: 10 }}>
          <h1 className="font-head" style={{ margin: 0, fontSize: 40 }}>
            we’ve done this at scale
          </h1>
          <p style={{ margin: 0, fontSize: 12, maxWidth: 900 }}>
            Copy and images will be updated once finalized.
          </p>
        </header>
  
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {items.map((x, i) => (
            <article key={i} style={{ display: "grid", gap: 10 }}>
              <div style={{ height: 170, background: "#e5e5e5" }} />
              <div style={{ display: "grid", gap: 4 }}>
                <div className="font-head" style={{ fontSize: 12 }}>
                  {x.title}
                </div>
                <div style={{ fontSize: 12 }}>{x.meta}</div>
              </div>
            </article>
          ))}
        </section>
      </main>
    );
  }