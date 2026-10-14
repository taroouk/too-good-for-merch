"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import AuthAction from "src/components/AuthAction";
import SiteAccountMenu from "src/components/site/SiteAccountMenu";
import { avatarInitial, buildNavModel, displayNameFromEmail, headerHidden, type NavLink } from "src/components/site/nav-model";
import "./site-header.css";

// The one header every customer-facing page shares (the admin dashboard has
// its own sidebar shell). What differs per page -- the Studio's project tabs,
// the active-link marker, LOGIN vs CREATE ACCOUNT on the auth pages, ORDERS
// for signed-in customers -- comes from buildNavModel.
export default function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const { data: session, status } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Bag badge: fetched when signed in, refreshed on navigation and whenever
  // the Builder says it added something ("tgfm:bag-changed").
  const [bagCount, setBagCount] = useState(0);
  const authedForBag = status === "authenticated";
  useEffect(() => {
    if (!authedForBag) {
      setBagCount(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetch("/api/bag/count", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { count?: number } | null) => {
          if (!cancelled && typeof data?.count === "number") setBagCount(data.count);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("tgfm:bag-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("tgfm:bag-changed", load);
    };
  }, [authedForBag, pathname]);

  // Navigating (or the header disappearing) always closes the menu.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  if (headerHidden(pathname)) return null;

  const authenticated = status === "authenticated";
  const email = session?.user?.email ?? "";
  const role = (session?.user as { role?: string } | undefined)?.role ?? null;
  const model = buildNavModel(pathname, authenticated, role);
  const closeMenu = () => setMenuOpen(false);
  const loginHref = `/login?callbackUrl=${encodeURIComponent(pathname)}`;

  // MY BAG + item count (the count shows for signed-in customers, muted at 0).
  const bagLinkEl = (onClick?: () => void) => (
    <Link
      href={model.bagLink.href}
      className="siteBagLink"
      onClick={onClick}
      aria-current={model.bagLink.active ? "page" : undefined}
      aria-label={authenticated ? `My bag, ${bagCount} ${bagCount === 1 ? "item" : "items"}` : "My bag"}
    >
      MY BAG
      {authenticated ? <span className={`siteBagCount${bagCount === 0 ? " isEmpty" : ""}`} aria-hidden="true">{bagCount > 99 ? "99+" : bagCount}</span> : null}
    </Link>
  );

  const renderLink = (link: NavLink, onClick?: () => void) => (
    <Link key={link.href + link.label} href={link.href} onClick={onClick} aria-current={link.active ? "page" : undefined}>
      {link.label.toUpperCase()}
    </Link>
  );

  return (
    <>
      <header className={`marketingHeader ${scrolled ? "scrolled" : ""}`} data-density={authenticated ? "user" : "guest"}>
        <button
          className="mobileMenuBtn"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobileMenu"
          onClick={() => setMenuOpen((value) => !value)}
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
          {model.left.map((link) => renderLink(link))}
          {bagLinkEl()}
        </nav>

        <Link className="marketingLogo" href="/" aria-label="Too Good For Merch">
          <img src="/logo.svg" alt="Too Good For Merch" />
        </Link>

        <nav className="marketingNav marketingNavRight" aria-label="Account links">
          {model.studio ? renderLink(model.studio) : null}
          {authenticated ? (
            <SiteAccountMenu email={email} items={model.accountItems} />
          ) : model.authLink ? (
            renderLink(model.authLink)
          ) : status === "loading" ? (
            <span className="siteAccountPlaceholder" aria-hidden="true" />
          ) : (
            <AuthAction className="authActionReset" loginHref={loginHref} />
          )}
        </nav>
      </header>

      <aside id="mobileMenu" className="mobileMenu" data-open={menuOpen ? "true" : "false"}>
        <div className="mobileMenuInner">
          <div className="mobileMenuGroup">
            {model.left.map((link) => renderLink(link, closeMenu))}
            {bagLinkEl(closeMenu)}
          </div>

          <div className="mobileMenuDivider" />

          {authenticated ? (
            <div className="mobileProfile">
              <span className="siteAvatar siteAvatarLg" aria-hidden="true">{avatarInitial(email)}</span>
              <span className="siteAccountHeadText">
                <strong>{displayNameFromEmail(email)}</strong>
                <small>{email}</small>
              </span>
            </div>
          ) : null}

          <div className="mobileMenuGroup">
            {model.studio ? renderLink(model.studio, closeMenu) : null}
            {model.accountItems.map((item) => renderLink(item, closeMenu))}
            {authenticated ? (
              <button type="button" onClick={() => void signOut({ callbackUrl: "/" })}>
                SIGN OUT
              </button>
            ) : model.authLink ? (
              renderLink(model.authLink, closeMenu)
            ) : (
              <AuthAction className="authActionReset" loginHref={loginHref} onAction={closeMenu} />
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
