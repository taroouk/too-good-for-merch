import Link from "next/link";
import { buttonClass } from "src/components/admin/ui/Button";

export function getPageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

// pageParam defaults to "page" for every existing single-list page; pages
// with two independently-paginated lists (e.g. admin/bespoke's open/closed
// sections) pass distinct param names ("openPage"/"closedPage") so paging
// one list doesn't reset the other.
export function pageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number,
  pageParam: string = "page",
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  if (page > 1) query.set(pageParam, String(page));
  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
  pageParam = "page",
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
  pageParam?: string;
}) {
  const pageCount = getPageCount(total, pageSize);
  if (pageCount <= 1) {
    return (
      <div className="border-t border-admin-border px-5 py-4 text-xs text-admin-faint">
        Showing {total} of {total}
      </div>
    );
  }
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-admin-border px-5 py-4 sm:flex-row">
      <p className="text-xs text-admin-faint">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={pageHref(basePath, params, page - 1, pageParam)} className={buttonClass({ variant: "outline", size: "sm" })}>
            Previous
          </Link>
        ) : (
          <span className={buttonClass({ variant: "outline", size: "sm", className: "opacity-40" })}>Previous</span>
        )}
        <span className="px-2 text-xs font-semibold text-admin-muted">
          Page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={pageHref(basePath, params, page + 1, pageParam)} className={buttonClass({ variant: "outline", size: "sm" })}>
            Next
          </Link>
        ) : (
          <span className={buttonClass({ variant: "outline", size: "sm", className: "opacity-40" })}>Next</span>
        )}
      </div>
    </div>
  );
}
