import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="lp">
      {/* HERO 1 */}
      <section className="lpHeroOne" aria-label="Hero">
        <div className="lpContainer">
          <div className="lpHeroMedia" aria-hidden="true" />
          <p className="lpHeroTagline">
            for artists. events. brands. that take merch seriously
          </p>
        </div>
      </section>

      {/* HERO 2 - ENTER STUDIO */}
      <section className="lpEnter" aria-label="Enter Studio">
        <div className="lpContainer">
          <div className="lpEnterWrap">
            <div className="lpEnterTop">ENTER</div>

            <Link className="lpEnterPanelLink" href="/studio" aria-label="Enter Studio">
              <div className="lpEnterPanel" aria-hidden="true" />
            </Link>

            <div className="lpEnterBottom">STUDIO</div>
          </div>
        </div>
      </section>

      {/* OUR WORK - SCALE */}
      <section className="lpSection" id="our-work" aria-label="Our Work">
        <div className="lpContainer">
          <h2 className="lpH2">we’ve done this at scale</h2>
          <p className="lpP">
            We produce tour-level garments for artists, events, and licensed brands - where quality and timelines aren’t optional.
            From stadium tours to licensed global merch, we’ve delivered high-volume production under pressure without compromising finish, fit, or deadlines.
          </p>

          <div className="lpGrid">
            <article className="lpCard">
              <div className="lpCardMedia" aria-hidden="true" />
              <div className="lpCardBody">
                <div className="lpCardTitle">TAYLOR SWIFT | ERAS TOUR MERCH</div>
                <div className="lpCardMeta">2023 - 2024</div>
                <div className="lpCardStat">+1M printed T-shirts &amp; Hoodies</div>
              </div>
            </article>

            <article className="lpCard">
              <div className="lpCardMedia" aria-hidden="true" />
              <div className="lpCardBody">
                <div className="lpCardTitle">ARTISTS | LICENSED MERCH</div>
                <div className="lpCardMeta">2023 - present</div>
                <div className="lpCardStat">+100K printed T-shirts &amp; Hoodies</div>
              </div>
            </article>

            <article className="lpCard">
              <div className="lpCardMedia" aria-hidden="true" />
              <div className="lpCardBody">
                <div className="lpCardTitle">TV &amp; MOVIES | LICENSED MERCH</div>
                <div className="lpCardMeta">2023 - present</div>
                <div className="lpCardStat">+100K printed T-shirts &amp; Hoodies</div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* OUR WORK - BOUTIQUE */}
      <section className="lpSection" aria-label="Boutique Runs">
        <div className="lpContainer">
          <h2 className="lpH2">we’ve done boutique runs, too</h2>
          <p className="lpP lpPCompact">
            Not every project needs a million units.<br />
            Some need 30.<br />
            We apply the same production standards, just at a different scale.
          </p>

          <div className="lpGrid">
            <article className="lpCard">
              <div className="lpCardMedia" aria-hidden="true" />
              <div className="lpCardBody">
                <div className="lpCardTitle">MK wedding | PARIS</div>
                <div className="lpCardMeta">2024</div>
                <div className="lpCardStat">30 printed T-shirts</div>
              </div>
            </article>

            <article className="lpCard">
              <div className="lpCardMedia" aria-hidden="true" />
              <div className="lpCardBody">
                <div className="lpCardTitle">KN WEDDING | GOUNA</div>
                <div className="lpCardMeta">2024</div>
                <div className="lpCardStat">50 printed T-shirts</div>
              </div>
            </article>

            <article className="lpCard">
              <div className="lpCardMedia" aria-hidden="true" />
              <div className="lpCardBody">
                <div className="lpCardTitle">FA WEDDING | CAIRO</div>
                <div className="lpCardMeta">2026</div>
                <div className="lpCardStat">100 printed T-shirts</div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* CONTACT BLOCK */}
      <section className="lpContact" id="contact" aria-label="Contact">
        <div className="lpContainer">
          <div className="lpContactGrid">
            <h2 className="lpContactBig">YOUR<br />BEST DROP<br />STARTS HERE</h2>

            <div className="lpContactLinks">
              <a href="https://instagram.com/toogoodformerch" target="_blank" rel="noreferrer">
                Link to IG: @toogoodformerch
              </a>
              <a href="https://tiktok.com/@toogoodformerch" target="_blank" rel="noreferrer">
                Link to TT: @toogoodformerch
              </a>

              {/* خلي الواتساب placeholder لحد ما تحط الرقم الحقيقي */}
              <a href="https://wa.me/0000000000" target="_blank" rel="noreferrer">
                WhatsApp number ...
              </a>

              <a href="mailto:hello@toogoodformerch">Email: hello@toogoodformerch</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}