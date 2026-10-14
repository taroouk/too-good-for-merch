"use client";

import { useEffect } from "react";

// Tells the site header to re-read its bag badge whenever this page's item
// count changes (e.g. after Remove, which is a server action and so doesn't
// change the URL the header watches).
export default function BagSync({ count }: { count: number }) {
  useEffect(() => {
    window.dispatchEvent(new Event("tgfm:bag-changed"));
  }, [count]);
  return null;
}
