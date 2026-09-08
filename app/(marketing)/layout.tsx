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

  // Keyboard-accessibility parity with the admin sidebar's UserMenu/MobileNav
  // (src/components/admin/UserMenu.tsx), which already close on Escape --
  // this overlay previously had no keydown handler at all, so a keyboard
  // user had no way to dismiss it short of tabbing to the "MENU" button
  // itself. Only listens while open, same guard as the admin components use.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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
          <a href="/studio">ENTER STUDIO</a>
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
            <a href="/studio" onClick={closeMenu}>
              ENTER STUDIO
            </a>
            <AuthAction className="authActionReset" onAction={closeMenu} />
          </div>
        </div>
      </aside>

      <div className="marketingContent">{children}</div>
    </div>
  );
}
