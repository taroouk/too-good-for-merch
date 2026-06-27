"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import AuthAction from "src/components/AuthAction";

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function StudioNavbar({
  projectId,
}: {
  projectId: string;
  projectName: string;
}) {
  const pathname = usePathname();

  const tabs = [
    {
      name: "Builder",
      href: `/studio/projects/${projectId}/builder`,
    },
  ];

  return (
    <header className="studio-navbar">
      <div className="studio-navbar-inner">
        <div className="studio-navbar-left">
          <Link
            href="/"
            className="studio-navbar-logo-link"
            aria-label="Too Good For Merch home"
          >
            <Image
              src="/logo.svg"
              alt="Too Good For Merch"
              width={170}
              height={62}
              className="studio-navbar-logo"
              priority
            />
          </Link>

          <nav className="studio-breadcrumb" aria-label="Main navigation">
            <Link href="/" className="studio-breadcrumb-link">
              Home
            </Link>
          </nav>
        </div>

        <nav
          className="studio-navbar-tabs"
          aria-label="Studio navigation"
        >
          {tabs.map((tab) => {
            const active = pathname === tab.href;

            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  "studio-navbar-tab",
                  active
                    ? "studio-navbar-tab-active"
                    : "studio-navbar-tab-idle",
                )}
              >
                {tab.name}
              </Link>
            );
          })}
          <AuthAction className="studio-navbar-tab studio-navbar-tab-idle authActionReset" />
        </nav>
      </div>
    </header>
  );
}
