"use client";

import { useEffect, useState } from "react";

export default function AdminToast({ message }: { message?: string }) {
  const [visible, setVisible] = useState(Boolean(message));
  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);
  if (!visible || !message) return null;
  return <div role="status" className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-sm rounded-xl bg-admin-ink px-5 py-3 text-sm font-medium text-white shadow-2xl sm:inset-x-auto sm:right-5">{message}</div>;
}
