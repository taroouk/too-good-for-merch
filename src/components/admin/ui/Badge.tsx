export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "dark";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-black/5 text-admin-muted",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
  dark: "bg-admin-ink text-white",
};

export default function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
