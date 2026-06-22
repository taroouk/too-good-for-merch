import Link from "next/link";
import SignOutButton from "../../../app/studio/SignOutButton";

const NAV = [
  ["/admin", "Overview", "⌂"],
  ["/admin/orders", "Orders", "▤"],
  ["/admin/payments", "Payments", "↔"],
  ["/admin/pricing", "Products & pricing", "◇"],
  ["/admin/users", "Customers", "♙"],
  ["/admin/settings", "Settings", "⚙"],
] as const;

export default function AdminShell({ children, email }: { children: React.ReactNode; email?: string | null }) {
  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#121826]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#111827] text-white lg:flex">
        <Link href="/admin" className="border-b border-white/10 px-6 py-7">
          <span className="block text-xs font-semibold uppercase tracking-[.22em] text-white/45">Too Good</span>
          <span className="mt-1 block text-xl font-semibold">Commerce Admin</span>
        </Link>
        <nav className="flex-1 space-y-1 px-3 py-5">
          {NAV.map(([href, label, icon]) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white/65 transition hover:bg-white/10 hover:text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/8 text-base">{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="truncate px-2 text-xs text-white/45">{email ?? "Administrator"}</p>
          <div className="mt-3 flex items-center justify-between px-2 text-sm"><Link href="/" className="text-white/70 hover:text-white">View store</Link><SignOutButton /></div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between"><Link href="/admin" className="font-semibold">Commerce Admin</Link><Link href="/" className="text-sm text-black/50">Store ↗</Link></div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">{NAV.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap rounded-lg bg-black/5 px-3 py-2 text-xs font-semibold">{label}</Link>)}</nav>
        </header>
        {children}
      </div>
    </div>
  );
}
