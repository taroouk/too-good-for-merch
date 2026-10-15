"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-black/70 transition hover:border-black hover:text-black print:hidden"
    >
      Print / save as PDF
    </button>
  );
}
