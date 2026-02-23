import Link from "next/link";
import "./marketing.css";

export default function HomePage() {
  return (
    <main className="homeMain">
      <section className="homeHero">
        <div className="homeHeroInner" />
      </section>

      <section className="homeBottom">
        <p className="homeTagline">for artists. events. brands. that take merch seriously</p>

        <Link href="/studio" className="font-head homeCta" style={{ textDecoration: "none" }}>
          ENTER STUDIO →
        </Link>
      </section>
    </main>
  );
}