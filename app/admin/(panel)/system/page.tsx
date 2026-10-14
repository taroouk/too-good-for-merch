import Link from "next/link";
import PageHeader from "src/components/admin/ui/PageHeader";
import StatCard from "src/components/admin/ui/StatCard";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import type { BadgeTone } from "src/components/admin/ui/Badge";
import { getSystemHealth, type HealthLevel } from "src/lib/admin/system-health";

export const dynamic = "force-dynamic";

const LEVEL_TONE: Record<HealthLevel, BadgeTone> = { ok: "success", warn: "warning", fail: "danger" };
const LEVEL_LABEL: Record<HealthLevel, string> = { ok: "Healthy", warn: "Attention", fail: "Failing" };

export default async function SystemHealthPage() {
  const { checks, dbLatencyMs } = await getSystemHealth();
  const failing = checks.filter((check) => check.level === "fail").length;
  const warning = checks.filter((check) => check.level === "warn").length;
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <div className="mx-auto max-w-5xl">
        <PageHeader eyebrow="System" title="System health" subtitle="Live checks of the database, payments, webhooks, pricing, and configuration. Reload to re-run them." />

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Failing" value={failing} tone={failing ? "danger" : "default"} />
          <StatCard label="Needs attention" value={warning} tone={warning ? "warning" : "default"} />
          <StatCard label="Database latency" value={dbLatencyMs != null ? `${dbLatencyMs} ms` : "—"} />
          <StatCard label="Environment" value={process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"} hint={commit ? `Commit ${commit}` : undefined} />
        </section>

        <Card className="mt-6" padded={false} title="Checks">
          <ul className="divide-y divide-admin-border">
            {checks.map((check) => (
              <li key={check.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-admin-ink">{check.label}</p>
                  <p className="mt-1 text-sm text-admin-muted">{check.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {check.href && check.level !== "ok" ? <Link href={check.href} className="text-xs font-semibold text-admin-ink underline">Open</Link> : null}
                  <Badge tone={LEVEL_TONE[check.level]}>{LEVEL_LABEL[check.level]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
