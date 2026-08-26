import type { ReactNode } from "react";

export type StatTone = "default" | "dark" | "success" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<StatTone, string> = {
  default: "border border-admin-border bg-white text-admin-ink",
  dark: "bg-admin-ink text-white",
  success: "bg-emerald-50 text-emerald-900",
  warning: "bg-amber-50 text-amber-900",
  danger: "bg-red-50 text-red-900",
  info: "bg-blue-50 text-blue-900",
};

const HINT_OPACITY: Record<StatTone, string> = {
  default: "text-admin-faint",
  dark: "text-white/45",
  success: "text-emerald-900/50",
  warning: "text-amber-900/50",
  danger: "text-red-900/50",
  info: "text-blue-900/50",
};

export default function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
}) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm sm:p-5 ${TONE_CLASSES[tone]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className={`mt-2 text-xs ${HINT_OPACITY[tone]}`}>{hint}</p> : null}
    </div>
  );
}
