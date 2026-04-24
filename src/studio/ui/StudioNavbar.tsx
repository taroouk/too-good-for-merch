"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function StudioNavbar({
  projectId,
  projectName,
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
    {
      name: "Assets",
      href: `/studio/projects/${projectId}/assets`,
    },
    {
      name: "Designs",
      href: `/studio/projects/${projectId}/designs`,
    },
  ];

  return (
    <div className="w-full border-b bg-white">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
        
        {/* LEFT */}
        <div className="flex items-center gap-6">
          
          {/* LOGO */}
          <Link href="/" className="flex items-center h-full">
            <Image
              src="/logo.svg"
              alt="Too Good For Merch"
              width={160}
              height={60}
              className="h-[42px] w-auto object-contain"
              priority
            />
          </Link>

          {/* BREADCRUMB */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/studio/projects" className="hover:text-black transition">
              Projects
            </Link>

            <span>/</span>

            <span className="font-medium text-black">{projectName}</span>

            <span>/</span>

            <span className="font-medium text-black">Builder</span>
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-6">
          {tabs.map((tab) => {
            const active = pathname === tab.href;

            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  "text-sm font-medium transition",
                  active
                    ? "text-black underline underline-offset-4"
                    : "text-gray-500 hover:text-black"
                )}
              >
                {tab.name}
              </Link>
            );
          })}
        </div>

      </div>
    </div>
  );
}