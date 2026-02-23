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
        <nav className="marketingNav">
          <Link href="/">HOME</Link>
          <Link href="/portfolio">OUR WORK</Link>
          <Link href="/contact">CONTACT</Link>
        </nav>

        <div className="marketingLogo" aria-label="Too Good For Merch logo">
          {/* لو عندك logo image بدل النص، حط <img/> هنا */}
          <img src="/logo.svg" alt="Too Good For Merch" />
        </div>

        {/* يمين الهيدر: نخليه نص بس (مش Links) عشان مفيش 404 */}
        <div className="marketingNav marketingNavRight">
          <span className="mutedNav">ACCOUNT</span>
          <span className="mutedNav">WISHLIST</span>
          <span className="mutedNav">BAG (0)</span>
        </div>
      </header>

      <div className="marketingContent">{children}</div>
    </div>
  );
}