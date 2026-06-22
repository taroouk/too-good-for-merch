import Link from "next/link";
import { toggleUserBlockedAction } from "src/actions/admin-system-actions";
import AdminToast from "src/components/admin/AdminToast";
import { prisma } from "src/lib/prisma";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 120);
  const [users, paidTotals] = await Promise.all([
    prisma.user.findMany({
      where: q
        ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 250,
      include: { _count: { select: { orders: true, builds: true } } },
    }),
    prisma.order.groupBy({
      by: ["userId"],
      where: { paymentStatus: "PAID", userId: { not: null } },
      _sum: { totalCents: true },
    }),
  ]);
  const paidByUser = new Map(paidTotals.map((row) => [row.userId, row._sum.totalCents ?? 0]));
  const currency = process.env.STORE_CURRENCY ?? "USD";

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">Accounts</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-2 text-sm text-black/45">Customer accounts, order history, and access controls.</p>
        <section className="mt-7 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 p-4">
            <form className="flex max-w-lg gap-2">
              <input name="q" defaultValue={q} placeholder="Search email or phone…" className="h-11 flex-1 rounded-xl border border-black/10 bg-[#f8f8f8] px-4 text-sm outline-none focus:border-black" />
              <button className="rounded-xl bg-[#111827] px-5 text-sm font-semibold text-white">Search</button>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-[#f8f8f8] text-[11px] uppercase tracking-wider text-black/35">
                <tr><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Joined</th><th className="px-5 py-4">Orders</th><th className="px-5 py-4">Projects</th><th className="px-5 py-4">Paid value</th><th className="px-5 py-4">Access</th><th className="px-5 py-4" /></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-4"><p className="font-semibold">{user.email ?? "No email"}</p><p className="mt-1 text-xs text-black/40">{user.phone ?? "No phone"} · {user.role}</p></td>
                    <td className="px-5 py-4 text-black/50">{user.createdAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}</td>
                    <td className="px-5 py-4 font-semibold">{user._count.orders}</td>
                    <td className="px-5 py-4">{user._count.builds}</td>
                    <td className="px-5 py-4 font-semibold">{currency} {((paidByUser.get(user.id) ?? 0) / 100).toFixed(2)}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${user.blockedAt ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{user.blockedAt ? "BLOCKED" : "ACTIVE"}</span></td>
                    <td className="px-5 py-4"><div className="flex items-center justify-end gap-3"><Link href={`/admin/users/${user.id}`} className="text-xs font-semibold underline">View orders</Link>{user.role !== "ADMIN" ? <form action={toggleUserBlockedAction}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="block" value={user.blockedAt ? "false" : "true"} /><button className={`text-xs font-semibold ${user.blockedAt ? "text-emerald-700" : "text-red-600"}`}>{user.blockedAt ? "Unblock" : "Block"}</button></form> : null}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
