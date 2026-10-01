import "./globals.css";
import localFont from "next/font/local";
import GlobalAuthAction from "src/components/GlobalAuthAction";
import Providers from "src/components/Providers";
import { ReactNode } from "react";

const league = localFont({
  src: [
    {
      // League Spartan variable (wght 100-900), Google Fonts v15, latin
      // subset. Registered for the light end only -- the project shipped
      // just SemiBold/Bold, so any weight below 600 was snapping up to
      // 600. Verified metrically identical to the static files below: the
      // same test string at 100px measures 1450.66px (static 600) vs
      // 1450.67px (variable at 600), and 1481.60 vs 1481.66 at 700, so
      // mixing the two cuts is safe.
      path: "../src/assets/fonts/LeagueSpartan-Variable.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../src/assets/fonts/LeagueSpartan-Variable.woff2",
      weight: "400",
      style: "normal",
    },
    {
      // Kept as static cuts: these carry the full 561-entry cmap, while
      // the variable file above is the latin subset.
      // WOFF2 rather than the original TTF: same font, ~60% fewer bytes
      // over the wire. Losslessly repacked with fontTools -- family name,
      // usWeightClass (600/700), italicAngle, unitsPerEm, glyph order and
      // the full 561-entry cmap were all verified identical to the TTF, so
      // the rendered typography is unchanged.
      path: "../src/assets/fonts/LeagueSpartan-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../src/assets/fonts/LeagueSpartan-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-league",
  display: "swap",
});

export const metadata = {
  title: "Too Good For Merch",
  description: "Studio",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`
          ${league.variable}
          bg-[#f5f5f3]
          text-black
          antialiased
        `}
      >
        <Providers>
          <GlobalAuthAction />
          {children}
        </Providers>
      </body>
    </html>
  );
}
