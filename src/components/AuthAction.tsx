"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

type AuthActionProps = {
  className?: string;
  loginLabel?: string;
  logoutLabel?: string;
  loginHref?: string;
  logoutCallbackUrl?: string;
  onAction?: () => void;
};

export default function AuthAction({
  className,
  loginLabel = "LOGIN",
  logoutLabel = "LOGOUT",
  loginHref = "/login",
  logoutCallbackUrl = "/",
  onAction,
}: AuthActionProps) {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <span className={className} aria-hidden="true">
        ...
      </span>
    );
  }

  if (status === "authenticated") {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          onAction?.();
          void signOut({ callbackUrl: logoutCallbackUrl });
        }}
      >
        {logoutLabel}
      </button>
    );
  }

  return (
    <Link className={className} href={loginHref} onClick={onAction}>
      {loginLabel}
    </Link>
  );
}
