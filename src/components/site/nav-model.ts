// Pure model of the site-wide header (no React, no DOM) so what each page
// shows is unit tested. SiteHeader.tsx renders it.

export type NavLink = { label: string; href: string; active: boolean };

export type NavModel = {
  left: NavLink[];
  // "Enter studio" -- only where it isn't redundant (null inside the Studio).
  studio: NavLink | null;
  // The shopping bag: rendered at the end of the LEFT group, with its item count
  // (signed-out visitors who click it are sent to log in).
  bagLink: NavLink;
  // What replaces the usual LOGIN slot, if anything (the auth pages).
  authLink: NavLink | null;
  // Signed-in only: the entries of the account dropdown (Sign out is added by the UI).
  accountItems: NavLink[];
  // true -> a signed-out visitor sees the shared LOGIN link in the auth slot.
  showLogin: boolean;
};

// "tarek.elfanty_92@gmail.com" -> "Tarek Elfanty". The user model only has
// an email, so the visible name is derived from its local part.
export function displayNameFromEmail(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const words = local
    .replace(/[0-9]+$/g, "")
    .split(/[._\-+\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  const name = words.join(" ").slice(0, 20).trim();
  return name || "Account";
}

export function avatarInitial(email: string | null | undefined): string {
  const name = displayNameFromEmail(email);
  return name === "Account" ? (email ?? "?").charAt(0).toUpperCase() || "?" : name.charAt(0).toUpperCase();
}

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

export function studioProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/studio\/projects\/([^/]+)(?:\/|$)/);
  if (!match || match[1] === "new") return null;
  return match[1];
}

// The admin dashboard has its own shell/sidebar, so the public header never shows there.
export function headerHidden(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function buildNavModel(pathname: string, authenticated: boolean, role?: string | null): NavModel {
  const projectId = studioProjectId(pathname);

  const left: NavLink[] = projectId
    ? [
        { label: "Home", href: "/", active: false },
        { label: "Builder", href: `/studio/projects/${projectId}/builder`, active: isUnder(pathname, `/studio/projects/${projectId}/builder`) },
      ]
    : [
        { label: "Home", href: "/", active: pathname === "/" },
        { label: "Portfolio", href: "/#our-work", active: isUnder(pathname, "/portfolio") },
        { label: "Contact", href: "/contact", active: isUnder(pathname, "/contact") },
      ];

  const inStudio = isUnder(pathname, "/studio");
  // Wishlist / My projects / Bespoke / My orders live in the account dropdown only --
  // listing them in the bar too was pure duplication.
  const studio: NavLink | null = inStudio ? null : { label: "Enter studio", href: "/studio", active: false };
  const bagLink: NavLink = { label: "My bag", href: "/bag", active: isUnder(pathname, "/bag") };

  const onAuthPage = AUTH_PAGES.some((page) => isUnder(pathname, page));
  let authLink: NavLink | null = null;
  if (onAuthPage && !authenticated) {
    authLink = pathname.startsWith("/register")
      ? { label: "Login", href: "/login", active: false }
      : pathname.startsWith("/login")
        ? { label: "Create account", href: "/register", active: false }
        : { label: "Login", href: "/login", active: false };
  }

  const accountItems: NavLink[] = authenticated
    ? [
        // Admins get the dashboard as the first entry of the account menu.
        ...(role === "ADMIN" ? [{ label: "Admin dashboard", href: "/admin", active: false }] : []),
        { label: "My orders", href: "/orders", active: isUnder(pathname, "/orders") },
        { label: "Wishlist", href: "/wishlist", active: isUnder(pathname, "/wishlist") },
        { label: "My projects", href: "/studio/projects", active: pathname === "/studio/projects" },
        { label: "Bespoke", href: "/bespoke", active: isUnder(pathname, "/bespoke") },
      ]
    : [];

  return { left, studio, bagLink, authLink, accountItems, showLogin: !authenticated && authLink === null };
}
