"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import AuthAction from "src/components/AuthAction";

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function StudioNavbar({
  projectId,
}: {
  projectId: string;
  projectName: string;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const tabs = [
    {
      name: "Builder",
      href: `/studio/projects/${projectId}/builder`,
    },
    { name: "Wishlist", href: "/wishlist" },
    { name: "Bespoke", href: "/bespoke" },
  ];

  return (
    <header className="studio-navbar">
      <div className="studio-navbar-inner">
        <div className="studio-navbar-left">
          <Link
            href="/"
            className="studio-navbar-logo-link"
            aria-label="Too Good For Merch home"
          >
            <Image
              src="/logo.svg"
              alt="Too Good For Merch"
              width={170}
              height={62}
              className="studio-navbar-logo"
              priority
            />
          </Link>

          <nav className="studio-breadcrumb" aria-label="Main navigation">
            <Link href="/" className="studio-breadcrumb-link">
              Home
            </Link>
          </nav>
        </div>

        <nav
          className="studio-navbar-tabs"
          aria-label="Studio navigation"
        >
          {tabs.map((tab) => {
            const active = pathname === tab.href;

            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  "studio-navbar-tab",
                  active
                    ? "studio-navbar-tab-active"
                    : "studio-navbar-tab-idle",
                )}
              >
                {tab.name}
              </Link>
            );
          })}
          <AuthAction className="studio-navbar-tab studio-navbar-tab-idle authActionReset" />
        </nav>

        {/* Mobile trigger -- hidden on desktop via CSS (globals.css). */}
        <button
          type="button"
          className="studio-navbar-burger"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {menuOpen ? (
        <div className="studio-navbar-mobile-menu" id="studio-navbar-mobile-menu">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              href={tab.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "studio-navbar-mobile-link",
                pathname === tab.href && "is-active",
              )}
            >
              {tab.name}
            </Link>
          ))}
          <AuthAction
            className="studio-navbar-mobile-link authActionReset"
            onAction={() => setMenuOpen(false)}
          />
        </div>
      ) : null}
    </header>
  );
}
