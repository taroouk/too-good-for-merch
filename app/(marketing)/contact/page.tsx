import Link from "next/link";
import {
  CONTACT_EMAIL,
  EMAIL_URL,
  INSTAGRAM_URL,
  TIKTOK_URL,
  WHATSAPP_PHONE,
  WHATSAPP_URL,
} from "src/lib/contact";

export default function ContactPage() {
  return (
    <main className="lp">
      <section className="contact contactPage">
        <div className="lpContainer contactGrid">
          <h1>
            YOUR BEST DROP <br />
            STARTS HERE
          </h1>

          <div className="contactLinks">
            <a href={INSTAGRAM_URL}>Instagram</a>
            <a href={TIKTOK_URL}>TikTok</a>
            <a href={WHATSAPP_URL}>WhatsApp {WHATSAPP_PHONE}</a>
            <a href={EMAIL_URL}>{CONTACT_EMAIL}</a>
            <Link href="/studio">ENTER STUDIO</Link>
          </div>
        </div>

        <div className="contactFooterLogo" aria-hidden="true">
          <img src="/logo2.svg" alt="" />
        </div>
      </section>
    </main>
  );
}
