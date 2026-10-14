import { prisma } from "src/lib/prisma";
import { LEGAL_DEFAULTS } from "src/lib/legal-defaults";
import { LEGAL_SLUGS, type LegalSlug } from "src/lib/legal-format";

export type LegalPageView = {
  slug: LegalSlug;
  title: string;
  body: string;
  // true = no admin edit yet, showing the built-in draft
  isDefault: boolean;
  updatedAt: Date | null;
  updatedByEmail: string | null;
};

// Reads fail open to the built-in text: the pages must exist even if the
// table isn't migrated yet or the database hiccups.
export async function getLegalPage(slug: LegalSlug): Promise<LegalPageView> {
  try {
    const row = await prisma.legalPage.findUnique({ where: { slug } });
    if (row) return { slug, title: row.title, body: row.body, isDefault: false, updatedAt: row.updatedAt, updatedByEmail: row.updatedByEmail };
  } catch {
    /* fall through to default */
  }
  return { slug, ...LEGAL_DEFAULTS[slug], isDefault: true, updatedAt: null, updatedByEmail: null };
}

export async function getAllLegalPages(): Promise<LegalPageView[]> {
  return Promise.all(LEGAL_SLUGS.map((slug) => getLegalPage(slug)));
}

// Recorded on each order at checkout: the revision of the customer-facing
// agreement they consented to (terms + refund policy). "default-v1" until an
// admin edits those pages.
export async function currentTermsVersion(): Promise<string> {
  const [terms, refunds] = await Promise.all([getLegalPage("terms"), getLegalPage("refunds")]);
  const stamp = (page: LegalPageView) => page.updatedAt?.toISOString() ?? "default-v1";
  return `terms:${stamp(terms)}|refunds:${stamp(refunds)}`;
}
