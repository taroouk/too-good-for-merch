import { redirect } from "next/navigation";
import { getAdminUser } from "src/lib/admin/auth";
import { safeAdminPath } from "src/lib/admin/action-url";
import AdminLoginClient from "./AdminLoginClient";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; denied?: string }>;
}) {
  const query = await searchParams;
  const callbackUrl = safeAdminPath(query.callbackUrl, "/admin");
  // Already a valid admin -> straight in.
  if (await getAdminUser()) redirect(callbackUrl);
  return <AdminLoginClient callbackUrl={callbackUrl} denied={query.denied === "1"} />;
}
