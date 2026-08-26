import type { ReactNode } from "react";

// Must match the @container thresholds defined in app/globals.css under
// "Admin table/card container queries". Add both a threshold here and a
// matching CSS block there if a future table needs a width not yet listed.
export type TableCardMinWidth = 520 | 760 | 850 | 900 | 1050 | 1080;

/**
 * Switches between a desktop `<table>` and a stacked mobile card list based
 * on the *actual* width available to this component -- via a CSS container
 * query keyed off this element's own content box, not `window.innerWidth`.
 * A viewport-only breakpoint can't account for the fixed admin sidebar
 * eating part of the viewport (256px expanded, 76px collapsed), so a table
 * with a real min-width of 1080px would still render -- and need its own
 * horizontal scrollbar -- at a "desktop" 1024px viewport where only ~710px
 * is actually free next to the sidebar. A container query only switches
 * once this component's own column is genuinely wide enough, whatever
 * caused that width (viewport size, or the sidebar being collapsed).
 *
 * Pure CSS, so both views are present at all times and the browser simply
 * shows/hides them -- no client JS, no flash of the wrong view on load.
 */
export default function TableCardSwitch({
  minWidth,
  table,
  cards,
}: {
  minWidth: TableCardMinWidth;
  table: ReactNode;
  cards: ReactNode;
}) {
  return (
    <div className={`admin-table-cq admin-table-cq-${minWidth}`}>
      <div className="admin-table-cq-table">{table}</div>
      <div className="admin-table-cq-cards">{cards}</div>
    </div>
  );
}
