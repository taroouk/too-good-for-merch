export default function ContactPage() {
  return (
    <main
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        alignItems: "center",
        gap: 24,
        overflow: "hidden",
      }}
    >
      {/* Left big headline */}
      <h1
  className="font-head"
  style={{
    margin: 0,
    fontSize: 88,      // 👈 كبرناه من 72 إلى 82
    lineHeight: 0.95,
    letterSpacing: 0.5,
    paddingLeft: 100,   // 👈 نزقناه يمين شوية
  }}
>
  YOUR
  <br />
  BEST DROP
  <br />
  STARTS HERE
</h1>

      {/* Right contact lines */}
      <div
  style={{
    justifySelf: "center",
    fontSize: 13,
    lineHeight: 1.6,
    display: "grid",
    gap: 4,
  }}
>
  <a href="https://instagram.com/toogoodformerch" target="_blank" rel="noreferrer">
    Link to IG: @toogoodformerch
  </a>

  <a href="https://tiktok.com/@toogoodformerch" target="_blank" rel="noreferrer">
    Link to TT: @toogoodformerch
  </a>

  <a href="https://wa.me/201118399923" target="_blank" rel="noreferrer">
    WhatsApp number: +20 111 839 9923
  </a>

  <a href="mailto:hello@toogoodformerch.com">
    Email: hello@toogoodformerch.com
  </a>
</div>
    </main>
  );
}