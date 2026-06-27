import Link from "next/link";
import { CONTACT_EMAIL, EMAIL_URL, WHATSAPP_URL } from "src/lib/contact";

export default function ComingSoonPage() {
  return (
    <main className="lp">
      <section className="comingSoonPage">
        <video
          src="/videos/hero.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div className="comingSoonOverlay" />
        <div className="comingSoonContent">
          <img src="/logo2.svg" alt="Too Good For Merch" />
          <p>COMING SOON</p>
          <h1>TOO GOOD FOR MERCH</h1>
          <div>
            <Link href="/studio">ENTER STUDIO</Link>
            <a href={WHATSAPP_URL}>WhatsApp</a>
            <a href={EMAIL_URL}>{CONTACT_EMAIL}</a>
          </div>
        </div>
      </section>
    </main>
  );
}
