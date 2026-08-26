import type { ReactNode } from "react";

export function cardClass(className = "") {
  return `rounded-2xl border border-admin-border bg-white shadow-sm ${className}`.trim();
}

export default function Card({
  title,
  subtitle,
  actions,
  padded = true,
  className = "",
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cardClass(`overflow-hidden ${className}`)}>
      {title ? (
        <div className="flex items-start justify-between gap-4 border-b border-admin-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold text-admin-ink">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-admin-faint">{subtitle}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? "p-5 sm:p-6" : ""}>{children}</div>
    </section>
  );
}
