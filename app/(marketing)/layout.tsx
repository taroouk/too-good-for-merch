import "../globals.css";
import "./marketing.css";
import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The header (and mobile menu) is the shared SiteHeader rendered by the
  // root layout; this layout only adds the marketing styles and footer.
  return (
    <div className="marketingShell">
      <div className="marketingContent">{children}</div>

      <footer style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px", justifyContent: "center", padding: "28px 20px 40px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/refunds">Refunds</Link>
        <Link href="/contact">Contact</Link>
      </footer>
    </div>
  );
}
