"use client";

import { useEffect, useState } from "react";
import "../globals.css";
import "./marketing.css";
import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
  }, [menuOpen]);

  return (
    <div className="marketingShell">

      <header className={`marketingHeader ${scrolled ? "scrolled" : ""}`}>

        <nav className="marketingNav marketingNavLeft">
          <Link href="/#hero">HOME</Link>
          <Link href="/#our-work">OUR WORK</Link>
        </nav>

        <button
          className="navToggle"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="navToggleIcon" />
        </button>

        <Link className="marketingLogo" href="/">
          <img src="/logo.svg" alt="Too Good For Merch" />
        </Link>

        <nav className="marketingNav marketingNavRight">
          <Link href="/#account">ACCOUNT</Link>
          <Link href="/#wishlist">WISHLIST</Link>
          <Link href="/#bag">BAG (0)</Link>
        </nav>

      </header>

      <div
        className={`mobileMenuOverlay ${menuOpen ? "open" : ""}`}
        onClick={() => setMenuOpen(false)}
      />

      <aside className={`mobileMenu ${menuOpen ? "open" : ""}`}>
        <div className="mobileMenuInner">
          <div className="mobileMenuGroup">
            <Link href="/#hero" onClick={() => setMenuOpen(false)}>HOME</Link>
            <Link href="/#our-work" onClick={() => setMenuOpen(false)}>OUR WORK</Link>
          </div>

          <div className="mobileMenuDivider" />

          <div className="mobileMenuGroup">
            <Link href="/#account" onClick={() => setMenuOpen(false)}>ACCOUNT</Link>
            <Link href="/#wishlist" onClick={() => setMenuOpen(false)}>WISHLIST</Link>
            <Link href="/#bag" onClick={() => setMenuOpen(false)}>BAG (0)</Link>
          </div>
        </div>
      </aside>

      <div className="marketingContent">{children}</div>
    </div>
  );
}