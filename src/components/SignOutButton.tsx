"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton({
  callbackUrl = "/",
  children = "Sign Out",
  className,
  onClick,
}: {
  callbackUrl?: string;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onClick?.();
        void signOut({ callbackUrl });
      }}
    >
      {children}
    </button>
  );
}
