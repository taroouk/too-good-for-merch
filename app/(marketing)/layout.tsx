import "../globals.css";
import "./marketing.css";
import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketingShell">
      <header className="marketingHeader">
        <nav className="marketingNav marketingNavLeft" aria-label="Primary">
          <Link href="/">HOME</Link>
          <Link href="/#our-work">OUR WORK</Link>
        </nav>

        <Link className="marketingLogo" href="/" aria-label="Too Good For Merch">
          <img src="/logo.svg" alt="Too Good For Merch" />
        </Link>

        <nav className="marketingNav marketingNavRight" aria-label="Account links">
          <Link href="/#account">ACCOUNT</Link>
          <Link href="/#wishlist">WISHLIST</Link>
          <Link href="/#bag">BAG (0)</Link>
        </nav>
      </header>

      <div className="marketingContent">{children}</div>
    </div>
  );
}