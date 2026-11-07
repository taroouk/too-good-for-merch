"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// A short, bounded, READ-ONLY check after landing on the success page: if the order's state moved on since this page was
// rendered (for example the review state was applied by a webhook that finished a moment later), the page is refreshed so
// the old state is not left on screen. At most CHECK_DELAYS_MS.length requests, then it stops for good. It never changes any
// payment or order state: it only calls the read-only status endpoint.
const CHECK_DELAYS_MS = [3000, 6000, 10000, 15000];

export default function SuccessStatusWatcher({ orderId, initialUnderReview, initialOrderStatus }: { orderId: string; initialUnderReview: boolean; initialOrderStatus: string }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    const timers: number[] = [];
    CHECK_DELAYS_MS.forEach((delay) => {
      timers.push(
        window.setTimeout(async () => {
          if (stopped) return;
          try {
            const response = await fetch(`/api/payments/paymob/verify?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
            if (!response.ok || stopped) return;
            const data = await response.json();
            if (Boolean(data.underReview) !== initialUnderReview || String(data.orderStatus) !== initialOrderStatus) {
              stopped = true;
              router.refresh();
            }
          } catch {
            // a failed check is simply skipped; the page already shows the last known state
          }
        }, delay),
      );
    });
    return () => {
      stopped = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [initialOrderStatus, initialUnderReview, orderId, router]);

  return null;
}
