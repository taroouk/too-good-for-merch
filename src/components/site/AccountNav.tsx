"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { label: "Orders", href: "/orders" },
  { label: "Wishlist", href: "/wishlist" },
  { label: "Bespoke", href: "/bespoke" },
  { label: "Bag", href: "/bag" },
] as const;

// Sub-navigation shared by the account pages, so a customer can move between
// Orders, Wishlist, Bespoke and the Bag without going back to the header menu.
export default function AccountNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Account" className="mt-6 flex gap-2 overflow-x-auto pb-1">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-black text-white" : "bg-white text-black/60 hover:text-black"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
