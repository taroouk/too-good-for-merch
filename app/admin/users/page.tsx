import Link from "next/link";
import { redirect } from "next/navigation";
import { toggleUserBlockedAction } from "src/actions/admin-system-actions";
import AdminToast from "src/components/admin/AdminToast";
import { prisma } from "src/lib/prisma";
import PageHeader from "src/components/admin/ui/PageHeader";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import SearchField from "src/components/admin/ui/SearchField";
import EmptyState from "src/components/admin/ui/EmptyState";
import Pagination, { getPageCount, pageHref } from "src/components/admin/ui/Pagination";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import { Table, Tbody, Td, Th, Thead } from "src/components/admin/ui/Table";
import TableCardSwitch from "src/components/admin/ui/TableCardSwitch";
import { buttonClass } from "src/components/admin/ui/Button";

const PAGE_SIZE = 25;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; notice?: string; page?: string }>;
}) {
  const query = await searchParams;
  const q = (query.q ?? "").trim().slice(0, 120);
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const where = q
    ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }] }
    : undefined;
  const [users, matchingCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { orders: true, builds: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  // Lifetime spend is canonical USD reporting (P1-14) -- totalCents is the
  // payment (EGP) amount, not what the customer was canonically charged in
  // USD, so it can never be summed and labeled a single currency directly.
  // P2-11: this previously fetched every paid order for every user in the
  // entire store (unbounded, grows forever) just to compute totals for the
  // 25 users on the current page. Scoped to only this page's user ids and
  // aggregated BY THE DATABASE per (userId, whether canonicalTotalUsdCents
  // is set) instead of pulling raw rows into memory.
  const pageUserIds = users.map((user) => user.id);
  const spendByUser = new Map<string, { revenueUsdCents: number; excludedLegacyCount: number }>();
  if (pageUserIds.length > 0) {
    const [withCanonicalTotal, withoutCanonicalTotal] = await Promise.all([
      prisma.order.groupBy({
        by: ["userId"],
        where: { paymentStatus: "PAID", userId: { in: pageUserIds }, canonicalTotalUsdCents: { not: null } },
        _sum: { canonicalTotalUsdCents: true },
      }),
      prisma.order.groupBy({
        by: ["userId"],
        where: { paymentStatus: "PAID", userId: { in: pageUserIds }, canonicalTotalUsdCents: null },
        _count: true,
      }),
    ]);
    for (const row of withCanonicalTotal) {
      if (!row.userId) continue;
      spendByUser.set(row.userId, { revenueUsdCents: row._sum.canonicalTotalUsdCents ?? 0, excludedLegacyCount: 0 });
    }
    for (const row of withoutCanonicalTotal) {
      if (!row.userId) continue;
      const existing = spendByUser.get(row.userId) ?? { revenueUsdCents: 0, excludedLegacyCount: 0 };
      spendByUser.set(row.userId, { ...existing, excludedLegacyCount: row._count });
    }
  }
  const currency = "USD";
  function userSpendLabel(userId: string) {
    const spend = spendByUser.get(userId);
    if (!spend) return `${currency} 0.00`;
    const base = `${currency} ${(spend.revenueUsdCents / 100).toFixed(2)}`;
    return spend.excludedLegacyCount > 0 ? `${base} (+${spend.excludedLegacyCount} legacy)` : base;
  }

  // See app/admin/orders/page.tsx for why an out-of-range page is resolved
  // to the last real page instead of rendering a misleading empty state.
  const pageCount = getPageCount(matchingCount, PAGE_SIZE);
  if (page > pageCount) {
    redirect(pageHref("/admin/users", { q }, pageCount));
  }

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Accounts" title="Customers" subtitle="Customer accounts, order history, and access controls." />

        <Card className="mt-7" padded={false}>
          <form className="border-b border-admin-border p-4">
            <div className="flex max-w-lg gap-2">
              <SearchField name="q" defaultValue={q} placeholder="Search email or phone…" />
              <button className={buttonClass()}>Search</button>
            </div>
          </form>

          <TableCardSwitch
            minWidth={850}
            table={
              <Table minWidth={850}>
                <Thead>
                  <tr>
                    <Th>Customer</Th>
                    <Th>Joined</Th>
                    <Th>Orders</Th>
                    <Th>Projects</Th>
                    <Th>Lifetime spend (USD)</Th>
                    <Th>Access</Th>
                    <Th />
                  </tr>
                </Thead>
                <Tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <Td>
                        <p className="font-semibold text-admin-ink">{user.email ?? "No email"}</p>
                        <p className="mt-1 text-xs text-admin-faint">{user.phone ?? "No phone"} · {user.role}</p>
                      </Td>
                      <Td className="text-admin-muted">{user.createdAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}</Td>
                      <Td className="font-semibold text-admin-ink">{user._count.orders}</Td>
                      <Td>{user._count.builds}</Td>
                      <Td className="font-semibold text-admin-ink">{userSpendLabel(user.id)}</Td>
                      <Td><Badge tone={user.blockedAt ? "danger" : "success"}>{user.blockedAt ? "Blocked" : "Active"}</Badge></Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-3">
                          <Link href={`/admin/users/${user.id}`} className="text-xs font-semibold text-admin-ink underline">View orders</Link>
                          {user.role !== "ADMIN" ? (
                            <form action={toggleUserBlockedAction}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="block" value={user.blockedAt ? "false" : "true"} />
                              <ConfirmSubmitButton
                                variant={user.blockedAt ? "secondary" : "danger"}
                                size="sm"
                                confirmMessage={user.blockedAt ? `Unblock ${user.email ?? "this customer"}?` : `Block ${user.email ?? "this customer"}? They won't be able to sign in or check out.`}
                              >
                                {user.blockedAt ? "Unblock" : "Block"}
                              </ConfirmSubmitButton>
                            </form>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </Tbody>
              </Table>
            }
            cards={
              <div className="divide-y divide-admin-border">
                {users.map((user) => (
                  <div key={user.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-admin-ink">{user.email ?? "No email"}</p>
                        <p className="mt-1 text-xs text-admin-faint">{user.phone ?? "No phone"} · {user.role}</p>
                      </div>
                      <Badge tone={user.blockedAt ? "danger" : "success"}>{user.blockedAt ? "Blocked" : "Active"}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-admin-faint">
                      <span>{user._count.orders} orders · {user._count.builds} projects</span>
                      <span className="font-semibold text-admin-ink">{userSpendLabel(user.id)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Link href={`/admin/users/${user.id}`} className="text-xs font-semibold text-admin-ink underline">View orders</Link>
                      {user.role !== "ADMIN" ? (
                        <form action={toggleUserBlockedAction}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="block" value={user.blockedAt ? "false" : "true"} />
                          <ConfirmSubmitButton
                            variant={user.blockedAt ? "secondary" : "danger"}
                            size="sm"
                            confirmMessage={user.blockedAt ? `Unblock ${user.email ?? "this customer"}?` : `Block ${user.email ?? "this customer"}? They won't be able to sign in or check out.`}
                          >
                            {user.blockedAt ? "Unblock" : "Block"}
                          </ConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            }
          />

          {!users.length ? <EmptyState title={q ? "No customers match your search" : "No customers yet"} /> : null}
          {users.length ? <Pagination page={page} pageSize={PAGE_SIZE} total={matchingCount} basePath="/admin/users" params={{ q }} /> : null}
        </Card>
      </div>
    </main>
  );
}
