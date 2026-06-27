"use client";

import { useEffect, useState } from "react";
import "../globals.css";
import "./marketing.css";
import Link from "next/link";
import AuthAction from "src/components/AuthAction";

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
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="marketingShell">
      <header className={`marketingHeader ${scrolled ? "scrolled" : ""}`}>
        <button
          className="mobileMenuBtn"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobileMenu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="mobileMenuWord" aria-hidden="true">
            <span className="full">MENU</span>
            <span className="split">
              <span className="me">ME</span>
              <span className="nu">NU</span>
            </span>
          </span>
          <span className="sr-only">Menu</span>
        </button>

        <nav className="marketingNav marketingNavLeft" aria-label="Primary">
          <Link href="/">HOME</Link>
          <Link href="/#our-work">PORTFOLIO</Link>
          <Link href="/contact">CONTACT</Link>
        </nav>

        <Link className="marketingLogo" href="/" aria-label="Too Good For Merch">
          <img src="/logo.svg" alt="Too Good For Merch" />
        </Link>

        <nav className="marketingNav marketingNavRight" aria-label="Account links">
          <Link href="/studio">ENTER STUDIO</Link>
          <AuthAction className="authActionReset" />
        </nav>
      </header>

      <aside
        id="mobileMenu"
        className="mobileMenu"
        data-open={menuOpen ? "true" : "false"}
      >
        <div className="mobileMenuInner">
          <div className="mobileMenuGroup">
            <Link href="/" onClick={closeMenu}>
              HOME
            </Link>
            <Link href="/#our-work" onClick={closeMenu}>
              PORTFOLIO
            </Link>
            <Link href="/contact" onClick={closeMenu}>
              CONTACT
            </Link>
          </div>

          <div className="mobileMenuDivider" />

          <div className="mobileMenuGroup">
            <Link href="/studio" onClick={closeMenu}>
              ENTER STUDIO
            </Link>
            <AuthAction className="authActionReset" onAction={closeMenu} />
          </div>
        </div>
      </aside>

      <div className="marketingContent">{children}</div>
    </div>
  );
}
