import Link from "next/link";

export default function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="mb-5 flex items-center gap-2 text-sm text-admin-faint">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-2">
          {index > 0 ? <span className="text-admin-faint">/</span> : null}
          {item.href ? (
            <Link href={item.href} className="font-semibold text-admin-muted hover:text-admin-ink">
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-admin-ink">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
