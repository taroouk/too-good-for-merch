import type { ReactNode } from "react";

// One card for the Bag, Wishlist and Orders pages: same width, same photo
// size, same text sizes and the same button style, laid out in a grid.
export const CARD_GRID_CLASS = "mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3";

// Black, spaced-out uppercase buttons, as on the Studio page.
const BUTTON_BASE =
  "inline-flex h-11 items-center justify-center rounded-[7px] border border-black px-4 text-center text-[11px] font-semibold uppercase tracking-[0.2em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-40";
export const CARD_BUTTON_PRIMARY = `${BUTTON_BASE} flex-1 bg-black text-white hover:bg-white hover:text-black`;
export const CARD_BUTTON_SECONDARY = `${BUTTON_BASE} bg-white text-black hover:bg-black hover:text-white`;
export const CARD_BUTTON_DISABLED = `${BUTTON_BASE} flex-1 cursor-not-allowed border-black/15 bg-black/5 text-black/40`;
// The page-level "Open Studio" button.
export const PAGE_BUTTON_CLASS = `${BUTTON_BASE} bg-black px-6 text-white hover:bg-white hover:text-black`;

type ProductCardProps = {
  image: string | null;
  imageAlt: string;
  title: string;
  price?: string;
  badge?: ReactNode;
  details: Array<[label: string, value: string]>;
  note?: ReactNode;
  actions: ReactNode;
};

export default function ProductCard({ image, imageAlt, title, price, badge, details, note, actions }: ProductCardProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="relative flex aspect-[4/5] items-center justify-center bg-[#efece6]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={imageAlt} className="h-full w-full object-contain" />
        ) : (
          <span className="text-sm text-black/40">No preview yet</span>
        )}
        {badge ? <div className="absolute left-3 top-3">{badge}</div> : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold leading-snug">{title}</h2>
          {price ? <strong className="shrink-0 text-base">{price}</strong> : null}
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-black/40">{label}</dt>
              <dd className="text-right font-medium text-black">{value}</dd>
            </div>
          ))}
        </dl>
        {note ? <p className="mt-3 text-xs leading-5 text-black/55">{note}</p> : null}
        <div className="mt-auto flex flex-wrap gap-2 pt-5">{actions}</div>
      </div>
    </article>
  );
}
