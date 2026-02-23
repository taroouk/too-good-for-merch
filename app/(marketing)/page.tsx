import Link from "next/link";

export default function HomePage() {
  return (
    <main className="homeMain">
      <section className="homeHero">
        <div className="homeHeroInner" />
      </section>

      <section className="homeBottom">
        <p className="homeTagline">
          for artists. events. brands. that take merch seriously
        </p>

        <Link className="homeCta" href="/studio">
          ENTER STUDIO <span aria-hidden>→</span>
        </Link>
      </section>
    </main>
  );
}