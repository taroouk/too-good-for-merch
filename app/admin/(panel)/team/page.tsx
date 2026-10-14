import { demoteAdminAction, promoteToAdminByEmailAction } from "src/actions/admin-team-actions";
import AdminToast from "src/components/admin/AdminToast";
import { requireAdmin } from "src/lib/admin/auth";
import { prisma } from "src/lib/prisma";
import PageHeader from "src/components/admin/ui/PageHeader";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import EmptyState from "src/components/admin/ui/EmptyState";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import { FieldLabel } from "src/components/admin/ui/Input";
import { buttonClass } from "src/components/admin/ui/Button";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams;
  const [me, admins] = await Promise.all([
    requireAdmin(),
    prisma.user.findMany({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, phone: true, createdAt: true, blockedAt: true },
    }),
  ]);
  const activeAdmins = admins.filter((admin) => !admin.blockedAt).length;

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-5xl">
        <PageHeader eyebrow="System" title="Team" subtitle="Who can sign in to this dashboard. Every change here is recorded in the audit log." />

        <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card padded={false} title={`Admins (${admins.length})`} subtitle={`${activeAdmins} active`}>
            {admins.length ? (
              <div className="divide-y divide-admin-border">
                {admins.map((admin) => (
                  <div key={admin.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-all font-semibold text-admin-ink">{admin.email ?? "No email"}</p>
                      <p className="mt-1 text-xs text-admin-faint">
                        {admin.phone ? `${admin.phone} · ` : ""}Joined {admin.createdAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {admin.id === me.id ? <Badge tone="dark">You</Badge> : null}
                      {admin.blockedAt ? <Badge tone="danger">Blocked</Badge> : <Badge tone="success">Active</Badge>}
                      {admin.id !== me.id ? (
                        <form action={demoteAdminAction}>
                          <input type="hidden" name="userId" value={admin.id} />
                          <ConfirmSubmitButton size="sm" confirmMessage={`Remove admin access for ${admin.email ?? "this account"}? They'll become a regular customer.`}>
                            Remove admin
                          </ConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No admins" />
            )}
          </Card>

          <Card title="Add an admin" subtitle="The person must already have a customer account.">
            <form action={promoteToAdminByEmailAction} className="space-y-4">
              <FieldLabel label="Account email">
                <input name="email" type="email" required placeholder="name@example.com" className="h-11 w-full rounded-xl border border-admin-border-strong px-4 text-sm outline-none focus:border-admin-ink" />
              </FieldLabel>
              <button className={buttonClass({ className: "w-full" })}>Make admin</button>
            </form>
            <p className="mt-4 text-xs leading-5 text-admin-faint">
              Admins can see customer details, change order and payment state, edit prices, and manage this team. You can&apos;t change your own role, and the last active admin can&apos;t be removed.
            </p>
          </Card>
        </div>
      </div>
    </main>
  );
}
