import Link from "next/link";
import type { ReactNode } from "react";
import type { Delta } from "src/lib/admin/overview";

const DELTA_CLASS: Record<Delta["kind"], string> = {
  up: "bg-emerald-100 text-emerald-800",
  down: "bg-red-100 text-red-700",
  flat: "bg-black/5 text-admin-muted",
  new: "bg-blue-100 text-blue-800",
  none: "bg-black/5 text-admin-faint",
};
const DELTA_DARK: Record<Delta["kind"], string> = {
  up: "bg-emerald-400/20 text-emerald-300",
  down: "bg-red-400/20 text-red-300",
  flat: "bg-white/10 text-white/60",
  new: "bg-blue-400/20 text-blue-300",
  none: "bg-white/10 text-white/50",
};

export function DeltaChip({ delta, dark = false }: { delta: Delta; dark?: boolean }) {
  const arrow = delta.kind === "up" ? "↑ " : delta.kind === "down" ? "↓ " : "";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${(dark ? DELTA_DARK : DELTA_CLASS)[delta.kind]}`}>
      {arrow}
      {delta.label}
    </span>
  );
}

// One headline number with its change versus the previous period.
export function KpiCard({
  label,
  value,
  delta,
  hint,
  dark = false,
}: {
  label: string;
  value: ReactNode;
  delta?: Delta;
  hint?: ReactNode;
  dark?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-col justify-between rounded-2xl p-4 shadow-sm sm:p-5 ${dark ? "bg-admin-ink text-white" : "border border-admin-border bg-white text-admin-ink"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${dark ? "text-white/55" : "text-admin-faint"}`}>{label}</p>
        {delta ? <DeltaChip delta={delta} dark={dark} /> : null}
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tracking-tight sm:text-[28px]">{value}</p>
      {hint ? <p className={`mt-2 text-xs leading-5 ${dark ? "text-white/45" : "text-admin-faint"}`}>{hint}</p> : null}
    </div>
  );
}

const TILE_TONE = {
  neutral: "border-admin-border bg-white",
  warning: "border-amber-200 bg-amber-50",
  danger: "border-red-200 bg-red-50",
  info: "border-blue-200 bg-blue-50",
} as const;

// An item of work waiting on the admin, with a count and a link to deal with it.
export function ActionTile({
  label,
  count,
  href,
  hint,
  tone,
}: {
  label: string;
  count: number;
  href: string;
  hint: string;
  tone: keyof typeof TILE_TONE;
}) {
  const active = count > 0;
  return (
    <Link
      href={href}
      className={`group flex min-w-0 items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? TILE_TONE[tone] : "border-admin-border bg-white"}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-admin-ink">{label}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-admin-faint">{active ? hint : "Nothing waiting"}</p>
      </div>
      <span className={`shrink-0 text-3xl font-semibold tabular-nums ${active ? "text-admin-ink" : "text-admin-faint/60"}`}>{count}</span>
    </Link>
  );
}

export function HealthDot({ level }: { level: "ok" | "warn" | "fail" }) {
  const color = level === "ok" ? "bg-emerald-500" : level === "warn" ? "bg-amber-500" : "bg-red-500";
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}
