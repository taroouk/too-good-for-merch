import "./globals.css";
import localFont from "next/font/local";
import { Inter } from "next/font/google";
import Providers from "src/components/Providers";
import { ReactNode } from "react";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const league = localFont({
  src: [
    { path: "../src/assets/fonts/LeagueSpartan-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../src/assets/fonts/LeagueSpartan-Bold.ttf", weight: "700", style: "normal" },
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
      <body className={`${inter.variable} ${league.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}