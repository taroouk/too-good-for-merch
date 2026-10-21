// file: src/components/Providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { DialogHost } from "src/components/ui/dialog";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      {children}
      <DialogHost />
    </SessionProvider>
  );
}