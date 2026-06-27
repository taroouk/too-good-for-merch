export type PortfolioItem = {
  title: string;
  year: string;
  bullets: string[];
  imageSrc: string;
  imageAlt: string;
  scale: "large" | "boutique";
};

export const PORTFOLIO_ITEMS: PortfolioItem[] = [
  {
    title: "TAYLOR SWIFT | ERAS TOUR MERCH",
    year: "2023-2024",
    bullets: ["Tour-level production", "+1M printed T-shirts & Hoodies"],
    imageSrc: "/images/taylor.jpg",
    imageAlt: "Taylor Swift merch production",
    scale: "large",
  },
  {
    title: "ARTISTS | LICENSED MERCH",
    year: "2023-present",
    bullets: ["Licensed artist merch", "+100K printed T-shirts & Hoodies"],
    imageSrc: "/images/artists.jpg",
    imageAlt: "Licensed artists merch",
    scale: "large",
  },
  {
    title: "TV & MOVIES | LICENSED MERCH",
    year: "2023-present",
    bullets: ["Licensed entertainment merch", "+100K printed T-shirts & Hoodies"],
    imageSrc: "/images/tv.jpg",
    imageAlt: "TV and movies merch",
    scale: "large",
  },
  {
    title: "MK wedding | PARIS",
    year: "2024",
    bullets: ["Boutique run", "+30 printed T-shirts"],
    imageSrc: "/images/wedding1.png",
    imageAlt: "Paris Wedding",
    scale: "boutique",
  },
  {
    title: "KN WEDDING | GOUNA",
    year: "2024",
    bullets: ["Boutique run", "+50 printed T-shirts"],
    imageSrc: "/images/wedding2.png",
    imageAlt: "Gouna Wedding",
    scale: "boutique",
  },
  {
    title: "FA WEDDING | CAIRO",
    year: "2026",
    bullets: ["Boutique run", "+100 printed T-shirts"],
    imageSrc: "/images/wedding3.png",
    imageAlt: "Cairo Wedding",
    scale: "boutique",
  },
];

export const LARGE_PORTFOLIO_ITEMS = PORTFOLIO_ITEMS.filter(
  (item) => item.scale === "large",
);

export const BOUTIQUE_PORTFOLIO_ITEMS = PORTFOLIO_ITEMS.filter(
  (item) => item.scale === "boutique",
);
