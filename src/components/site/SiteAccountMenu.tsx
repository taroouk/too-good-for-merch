"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { avatarInitial, displayNameFromEmail, type NavLink } from "src/components/site/nav-model";

// The signed-in customer's chip in the site header: avatar initial + name,
// opening a small account menu. (Mobile shows the same identity as a profile
// block inside the burger menu, see SiteHeader.)
export default function SiteAccountMenu({ email, items }: { email: string; items: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = displayNameFromEmail(email);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="siteAccount">
      <button
        type="button"
        className="siteAccountButton"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={email}
      >
        <span className="siteAvatar" aria-hidden="true">{avatarInitial(email)}</span>
        <span className="siteAccountName">{name}</span>
        <svg className="siteAccountChevron" data-open={open ? "true" : "false"} viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="siteAccountPanel" role="menu" aria-label="Account">
          <div className="siteAccountHead">
            <span className="siteAvatar siteAvatarLg" aria-hidden="true">{avatarInitial(email)}</span>
            <span className="siteAccountHeadText">
              <strong>{name}</strong>
              <small title={email}>{email}</small>
            </span>
          </div>
          <div className="siteAccountList">
            {items.map((item) => (
              <Link key={item.href} href={item.href} role="menuitem" aria-current={item.active ? "page" : undefined} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
          </div>
          <div className="siteAccountList siteAccountListEnd">
            <button type="button" role="menuitem" className="siteAccountSignOut" onClick={() => void signOut({ callbackUrl: "/" })}>
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
