import "../marketing.css";
type WorkItem = {
  title: string;
  years: string;
  stats: string;
};

function WorkGrid({ items }: { items: WorkItem[] }) {
  return (
    <section className="workGrid">
      {items.map((x, i) => (
        <article key={i} className="workCard">
          <div className="workImg" />
          <div className="workText">
            <div className="font-head" style={{ fontSize: 12, letterSpacing: 0.4 }}>
              {x.title}
            </div>
            <div>{x.years}</div>
            <div style={{ fontWeight: 600 }}>{x.stats}</div>
          </div>
        </article>
      ))}
    </section>
  );
}

export default function PortfolioPage() {
  const scaleItems: WorkItem[] = [
    { title: "TAYLOR SWIFT | ERAS TOUR MERCH", years: "2023 - 2024", stats: "+1M printed T-shirts & Hoodies" },
    { title: "ARTISTS | LICENSED MERCH", years: "2023 - present", stats: "+100K printed T-shirts & Hoodies" },
    { title: "TV & MOVIES | LICENSED MERCH", years: "2023 - present", stats: "+100K printed T-shirts & Hoodies" },
  ];

  const boutiqueItems: WorkItem[] = [
    { title: "MK wedding | PARIS", years: "2024", stats: "30 printed T-shirts" },
    { title: "KN WEDDING | GOUNA", years: "2024", stats: "50 printed T-shirts" },
    { title: "FA WEDDING | CAIRO", years: "2026", stats: "100 printed T-shirts" },
  ];

  return (
    <main className="portfolioMain">
      <section style={{ display: "grid", gap: 10 }}>
        <h1 className="font-head" style={{ margin: 0, fontSize: 44, letterSpacing: 0.5 }}>
          we’ve done this at scale
        </h1>
        <p style={{ margin: 0, fontSize: 12, maxWidth: 900, lineHeight: 1.4 }}>
          We produce tour-level garments for artists, events, and licensed brands — where quality and timelines aren’t optional.
          From stadium tours to licensed global merch, we’ve delivered high-volume production under pressure without compromising finish,
          fit, or deadlines.
        </p>
      </section>

      <WorkGrid items={scaleItems} />

      <section style={{ display: "grid", gap: 10 }}>
        <h1 className="font-head" style={{ margin: 0, fontSize: 44, letterSpacing: 0.5 }}>
          we’ve done boutique runs, too
        </h1>
        <p style={{ margin: 0, fontSize: 12, maxWidth: 900, lineHeight: 1.4 }}>
          Not every project needs a million units. Some need 30. We apply the same production standards, just at a different scale.
        </p>
      </section>

      <WorkGrid items={boutiqueItems} />
    </main>
  );
}