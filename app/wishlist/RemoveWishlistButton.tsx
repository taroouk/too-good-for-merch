"use client";

import { useState } from "react";
import { CARD_BUTTON_SECONDARY } from "src/components/site/ProductCard";

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
        className={CARD_BUTTON_SECONDARY}
      >
        Remove
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2" role="alertdialog" aria-label={`Remove ${name} from your wishlist?`}>
      <input type="hidden" name="itemId" value={itemId} />
      <span className="text-xs font-medium text-black/60">Remove?</span>
      <button type="button" onClick={() => setConfirming(false)} autoFocus className={CARD_BUTTON_SECONDARY}>
        Keep
      </button>
      <button type="submit" className={`${CARD_BUTTON_SECONDARY} border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white`}>
        Remove
      </button>
    </form>
  );
}
