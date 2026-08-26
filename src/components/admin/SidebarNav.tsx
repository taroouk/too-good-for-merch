"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UserMenu from "src/components/admin/UserMenu";
import { NAV_GROUPS, isNavItemActive } from "src/components/admin/nav-items";
import { ChevronLeftIcon } from "src/components/admin/ui/icons";

export default function SidebarNav({
  email,
  collapsed,
  onToggleCollapse,
}: {
  email?: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-admin-ink text-white transition-[width] duration-150 lg:flex ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      <Link href="/admin" className="flex items-center justify-between border-b border-white/10 px-5 py-6">
        {collapsed ? (
          <span className="block text-lg font-semibold">TG</span>
        ) : (
          <span>
            <span className="block text-xs font-semibold uppercase tracking-[.22em] text-white/45">Too Good</span>
            <span className="mt-1 block text-xl font-semibold">Commerce Admin</span>
          </span>
        )}
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <p className="px-4 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-white/30">{group.label}</p>
            ) : null}
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isNavItemActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : undefined}
                    className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                      active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed ? <span className="truncate">{label}</span> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className={collapsed ? "mb-2" : "mb-2 px-1"}>
          <UserMenu email={email} collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold text-white/45 hover:bg-white/5 hover:text-white/80"
        >
          <ChevronLeftIcon className={`h-3.5 w-3.5 transition ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed ? "Collapse" : null}
        </button>
      </div>
    </aside>
  );
}
