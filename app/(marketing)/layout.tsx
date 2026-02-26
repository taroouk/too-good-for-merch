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

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="marketingShell">

      <header className={`marketingHeader ${scrolled ? "scrolled" : ""}`}>

        <nav className="marketingNav marketingNavLeft" aria-label="Primary">
          <Link href="/#hero">HOME</Link>
          <Link href="/#our-work">OUR WORK</Link>
        </nav>

        <Link
          className="marketingLogo"
          href="/"
          aria-label="Too Good For Merch"
        >
          <img src="/logo.svg" alt="Too Good For Merch" />
        </Link>

        <nav
          className="marketingNav marketingNavRight"
          aria-label="Account links"
        >
          <Link href="/#account">ACCOUNT</Link>
          <Link href="/#wishlist">WISHLIST</Link>
          <Link href="/#bag">BAG (0)</Link>
        </nav>

      </header>

      <div className="marketingContent">{children}</div>
    </div>
  );
}