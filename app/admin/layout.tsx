import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "src/auth";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== Role.ADMIN) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#faf8f6] text-black">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link href="/admin" className="text-lg font-semibold">
            Too Good Admin
          </Link>

          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/admin" className="text-black/60 hover:text-black">
              Dashboard
            </Link>

            <Link
              href="/admin/orders"
              className="text-black/60 hover:text-black"
            >
              Orders
            </Link>

            <Link
              href="/admin/pricing"
              className="text-black/60 hover:text-black"
            >
              Pricing
            </Link>

            <Link href="/" className="text-black/60 hover:text-black">
              Website
            </Link>
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}