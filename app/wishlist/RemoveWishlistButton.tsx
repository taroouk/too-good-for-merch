"use client";

import { useState } from "react";

// "Remove" asks first, in place, so one stray click can't delete a saved design.
export default function RemoveWishlistButton({
  action,
  itemId,
  name,
}: {
  action: (formData: FormData) => void | Promise<void>;
  itemId: string;
  name: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-black/70 transition hover:border-black hover:text-black"
      >
        Remove
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2" role="alertdialog" aria-label={`Remove ${name} from your wishlist?`}>
      <input type="hidden" name="itemId" value={itemId} />
      <span className="text-xs font-medium text-black/60">Remove?</span>
      <button type="button" onClick={() => setConfirming(false)} autoFocus className="rounded-xl border border-black/15 px-3 py-2.5 text-sm font-semibold text-black/70 hover:border-black hover:text-black">
        Keep
      </button>
      <button type="submit" className="rounded-xl bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
        Remove
      </button>
    </form>
  );
}
