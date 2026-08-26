import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const fieldClass = "h-11 w-full rounded-xl border border-admin-border-strong bg-white px-4 text-sm text-admin-ink outline-none focus:border-admin-ink";

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-sm font-medium text-admin-ink">{children}</label>;
}

export default function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${className}`.trim()} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${fieldClass} ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}

export function FieldLabel({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-admin-ink">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}
