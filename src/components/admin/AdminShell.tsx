"use client";

import { useState } from "react";
import Link from "next/link";
import SidebarNav from "src/components/admin/SidebarNav";
import MobileNav from "src/components/admin/MobileNav";
import { MenuIcon } from "src/components/admin/ui/icons";

export default function AdminShell({ children, email }: { children: React.ReactNode; email?: string | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-admin-canvas text-admin-ink">
      <SidebarNav email={email} collapsed={collapsed} onToggleCollapse={() => setCollapsed((value) => !value)} />
      <MobileNav email={email} open={mobileOpen} onOpenChange={setMobileOpen} />

      <div className={`transition-[padding] duration-150 ${collapsed ? "lg:pl-[76px]" : "lg:pl-64"}`}>
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-admin-border bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/admin" className="font-semibold text-admin-ink">
            Commerce Admin
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-admin-ink hover:bg-black/5"
            aria-label="Open menu"
          >
            <MenuIcon />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
