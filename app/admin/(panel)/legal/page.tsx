import Link from "next/link";
import { resetLegalPageAction, saveLegalPageAction } from "src/actions/admin-legal-actions";
import AdminToast from "src/components/admin/AdminToast";
import { getAllLegalPages } from "src/lib/legal";
import { findPlaceholders } from "src/lib/legal-format";
import PageHeader from "src/components/admin/ui/PageHeader";
import Card from "src/components/admin/ui/Card";
import Badge from "src/components/admin/ui/Badge";
import ConfirmSubmitButton from "src/components/admin/ui/ConfirmSubmitButton";
import { buttonClass } from "src/components/admin/ui/Button";

const SLUG_LABELS: Record<string, string> = { terms: "Terms & Conditions", privacy: "Privacy Policy", refunds: "Refund & Returns Policy" };

export default async function AdminLegalPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams;
  const pages = await getAllLegalPages();

  return (
    <main className="p-4 sm:p-7 xl:p-9">
      <AdminToast message={query.notice} />
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="System"
          title="Legal Pages"
          subtitle="The Terms, Privacy and Refund pages customers see in the site footer and agree to at checkout. Edits go live immediately."
        />

        <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          The built-in text is a <strong>draft starting point, not legal advice</strong>. Fill in every <code className="font-mono">[BRACKETED]</code> value and have it reviewed
          before launch. Formatting: <code className="font-mono">## Heading</code>, <code className="font-mono">- list item</code>, <code className="font-mono">**bold**</code>, blank line between paragraphs.
        </div>

        <div className="mt-6 space-y-6">
          {pages.map((page) => {
            const placeholders = findPlaceholders(page.body);
            return (
              <Card
                key={page.slug}
                title={SLUG_LABELS[page.slug] ?? page.slug}
                subtitle={
                  page.isDefault
                    ? "Showing the built-in draft"
                    : `Last saved ${page.updatedAt?.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${page.updatedByEmail ? ` by ${page.updatedByEmail}` : ""}`
                }
                actions={
                  <div className="flex items-center gap-3">
                    {placeholders.length > 0 ? <Badge tone="warning">{placeholders.length} to fill in</Badge> : <Badge tone="success">No placeholders</Badge>}
                    <Link href={`/legal/${page.slug}`} target="_blank" className="text-xs font-semibold underline">View page ↗</Link>
                  </div>
                }
              >
                <form action={saveLegalPageAction} className="space-y-3">
                  <input type="hidden" name="slug" value={page.slug} />
                  <input name="title" defaultValue={page.title} required minLength={3} maxLength={120} aria-label="Page title" className="h-11 w-full rounded-xl border border-admin-border-strong px-4 text-sm font-semibold outline-none focus:border-admin-ink" />
                  <textarea
                    name="body"
                    defaultValue={page.body}
                    required
                    rows={18}
                    aria-label="Page body"
                    className="w-full rounded-xl border border-admin-border-strong px-4 py-3 font-mono text-xs leading-5 outline-none focus:border-admin-ink"
                  />
                  {placeholders.length > 0 ? (
                    <p className="text-xs text-amber-800">Still to fill in: {[...new Set(placeholders)].join(" · ")}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <button className={buttonClass()}>Save &amp; publish</button>
                  </div>
                </form>
                {!page.isDefault ? (
                  <form action={resetLegalPageAction} className="mt-3">
                    <input type="hidden" name="slug" value={page.slug} />
                    <ConfirmSubmitButton variant="outline" size="sm" confirmMessage={`Discard your edits to "${page.title}" and go back to the built-in draft?`}>
                      Revert to built-in draft
                    </ConfirmSubmitButton>
                  </form>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
