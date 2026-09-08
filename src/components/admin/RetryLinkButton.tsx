"use client";

import { useFormStatus } from "react-dom";

// P2-10: "Generate retry link" is a server action that creates a real
// Paymob order/payment link -- a fast double-click previously had nothing
// stopping the browser from firing two submissions before the first
// response (and thus the page's re-render removing/disabling the form)
// came back. useFormStatus's `pending` reflects this exact form's
// in-flight submission, so disabling the button while pending blocks the
// in-browser double-click. This is a UX-layer defense only; the real
// guard against two separate submissions (e.g. two tabs, or a second click
// after the first request already completed) is server-side in
// generateRetryPaymentLinkAction (src/actions/admin-system-actions.ts).
export default function RetryLinkButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-semibold underline disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Generating..." : "Generate retry link"}
    </button>
  );
}
