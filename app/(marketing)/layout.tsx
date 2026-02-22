import Link from "next/link";
import Image from "next/image";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: "100vh",
        padding: 24,
        overflow: "hidden",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          height: 64,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "start",      // 👈 يخلي اللينكات فوق
          paddingTop: 4,
        }}
      >
        {/* LEFT NAV */}
        <nav
          style={{
            display: "flex",
            gap: 18,
            fontSize: 12,
          }}
        >
          <Link href="/" style={{ textDecoration: "none" }}>
            HOME
          </Link>

          <Link href="/portfolio" style={{ textDecoration: "none" }}>
            OUR WORK
          </Link>

          <Link href="/contact" style={{ textDecoration: "none" }}>
            CONTACT
          </Link>
        </nav>

        {/* CENTER LOGO */}
        <Link
          href="/"
          style={{
            justifySelf: "center",
            textDecoration: "none",
          }}
        >
          <Image
            src="/logo.svg"
            alt="Too Good For Merch"
            width={220}
            height={70}
            priority
            style={{
              width: 220,
              height: "auto",
            }}
          />
        </Link>

        {/* RIGHT NAV */}
        <nav
          style={{
            display: "flex",
            gap: 18,
            fontSize: 12,
            justifyContent: "flex-end",
          }}
        >
          <Link href="/account" style={{ textDecoration: "none" }}>
            ACCOUNT
          </Link>

          <Link href="/wishlist" style={{ textDecoration: "none" }}>
            WISHLIST
          </Link>

          <Link href="/bag" style={{ textDecoration: "none" }}>
            BAG (0)
          </Link>
        </nav>
      </header>

      {/* PAGE CONTENT */}
      <div
        style={{
          marginTop: 18,
          height: "calc(100vh - 24px - 24px - 64px - 18px)",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}