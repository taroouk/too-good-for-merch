import "../marketing.css";

export default function ContactPage() {
  return (
    <main className="contactMain">
      <h1
        className="font-head contactHeading"
        style={{
          fontSize: 82, // Desktop size
        }}
      >
        YOUR
        <br />
        BEST DROP
        <br />
        STARTS HERE
      </h1>

      <div className="contactRight">
        <a href="https://instagram.com/toogoodformerch" target="_blank" rel="noreferrer">
          Link to IG: @toogoodformerch
        </a>
        <a href="https://tiktok.com/@toogoodformerch" target="_blank" rel="noreferrer">
          Link to TT: @toogoodformerch
        </a>
        <a href="https://wa.me/201118399923" target="_blank" rel="noreferrer">
          WhatsApp number: +20 111 839 9923
        </a>
        <a href="mailto:hello@toogoodformerch.com">Email: hello@toogoodformerch.com</a>
      </div>
    </main>
  );
}