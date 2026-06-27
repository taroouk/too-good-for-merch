"use client";

import { usePathname } from "next/navigation";
import AuthAction from "src/components/AuthAction";

const ROUTES_WITH_OWN_AUTH = [
  "/",
  "/coming-soon",
  "/contact",
  "/portfolio",
  "/studio",
  "/admin",
  "/login",
  "/register",
];

function routeHasOwnAuth(pathname: string) {
  return ROUTES_WITH_OWN_AUTH.some((route) => {
    if (route === "/") return pathname === "/";
    return pathname === route || pathname.startsWith(`${route}/`);
  });
}

export default function GlobalAuthAction() {
  const pathname = usePathname();

  if (routeHasOwnAuth(pathname)) return null;

  return (
    <div className="globalAuthAction">
      <AuthAction
        className="authActionReset globalAuthActionButton"
        loginHref={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
      />
    </div>
  );
}
