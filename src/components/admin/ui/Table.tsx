import type { ReactNode } from "react";

export function Table({ minWidth = 900, children }: { minWidth?: number; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="bg-admin-canvas text-[11px] uppercase tracking-wider text-admin-faint">{children}</thead>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-admin-border">{children}</tbody>;
}

export function Th({ children, align = "left" }: { children?: ReactNode; align?: "left" | "right" }) {
  return <th className={`px-5 py-4 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

export function Td({ children, align = "left", className = "" }: { children: ReactNode; align?: "left" | "right"; className?: string }) {
  return <td className={`px-5 py-4 ${align === "right" ? "text-right" : "text-left"} ${className}`}>{children}</td>;
}
