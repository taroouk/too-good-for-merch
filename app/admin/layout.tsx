import type { Metadata } from "next";

// Shared by the admin login page and the dashboard. No auth here on
// purpose: the login page lives under /admin too, so access control is in
// app/admin/(panel)/layout.tsx (requireAdmin) -- everything except
// /admin/login sits inside that route group.
// Belt and braces alongside robots.ts: never index or cache admin pages.
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
