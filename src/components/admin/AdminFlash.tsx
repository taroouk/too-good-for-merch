"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Shows the one-shot `?error=` message that admin server actions redirect
// back with (see src/lib/admin/action.ts). Successes keep using the
// per-page AdminToast; failures need to stay on screen until dismissed, so
// the admin can actually read what was rejected and why. The param is
// stripped from the URL after it's captured so a refresh doesn't replay it.
function FlashInner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const incoming = params.get("error");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!incoming) return;
    setMessage(incoming);
    const next = new URLSearchParams(params.toString());
    next.delete("error");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [incoming, params, pathname, router]);

  if (!message) return null;
  return (
    <div role="alert" className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-xl items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-xl">
      <p className="min-w-0 flex-1 font-medium">{message}</p>
      <button type="button" onClick={() => setMessage(null)} className="shrink-0 text-xs font-semibold underline" aria-label="Dismiss error">
        Dismiss
      </button>
    </div>
  );
}

export default function AdminFlash() {
  return (
    <Suspense fallback={null}>
      <FlashInner />
    </Suspense>
  );
}
