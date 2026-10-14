import AdminShell from "src/components/admin/AdminShell";
import { requireAdmin } from "src/lib/admin/auth";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return <AdminShell email={admin.email}>{children}</AdminShell>;
}
