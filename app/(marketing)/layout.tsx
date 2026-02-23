import Link from "next/link";
import Image from "next/image";
import "./marketing.css";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketingShell">
      <header className="marketingHeader">
        <nav className="marketingNav">
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

        <Link href="/" className="marketingLogo" style={{ textDecoration: "none" }} aria-label="Too Good For Merch">
          <Image src="/logo.svg" alt="Too Good For Merch" width={220} height={70} priority style={{ width: 220, height: "auto" }} />
        </Link>

        <nav className="marketingNav marketingNavRight">
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

      <div className="marketingContent">{children}</div>
    </div>
  );
}