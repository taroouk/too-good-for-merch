"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{
        height: 44,
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,.14)",
        background: "#fff",
        padding: "0 16px",
        fontWeight: 700,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      Sign out
    </button>
  );
}