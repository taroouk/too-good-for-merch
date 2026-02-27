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
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);

    const handleResize = () => {
      if (window.innerWidth > 720) setMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="marketingShell">
      <header className={`marketingHeader ${scrolled ? "scrolled" : ""}`}>
        <nav className="marketingNav marketingNavLeft" aria-label="Primary">
          <Link href="/#hero">HOME</Link>
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

        <button
          type="button"
          className={`navToggle ${menuOpen ? "open" : ""}`}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="mobileNav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="menuText" aria-hidden="true">
            <span className="menuMe">ME</span>
            <span className="menuNu">NU</span>
          </span>
        </button>
      </header>

      <div
        className={`mobileMenuOverlay ${menuOpen ? "open" : ""}`}
        onClick={closeMenu}
        aria-hidden={!menuOpen}
      />

      <aside
        id="mobileNav"
        className={`mobileMenu ${menuOpen ? "open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <div className="mobileMenuInner">
          <nav className="mobileMenuNav" aria-label="Mobile navigation">
            <Link href="/#hero" onClick={closeMenu}>
              HOME
            </Link>
            <Link href="/#our-work" onClick={closeMenu}>
              OUR WORK
            </Link>

            <div className="mobileMenuDivider" />

            <Link href="/#account" onClick={closeMenu}>
              ACCOUNT
            </Link>
            <Link href="/#wishlist" onClick={closeMenu}>
              WISHLIST
            </Link>
            <Link href="/#bag" onClick={closeMenu}>
              BAG (0)
            </Link>
          </nav>
        </div>
      </aside>

      <div className="marketingContent">{children}</div>
    </div>
  );
}