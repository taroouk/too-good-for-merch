import "./globals.css";
import localFont from "next/font/local";
import { Inter } from "next/font/google";
import Providers from "@/src/components/Providers";
import { ReactNode } from "react";


/* ================= INTER (Body Font) ================= */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/* ================= LEAGUE SPARTAN (Headers Only) ================= */
const league = localFont({
  src: [
    {
      path: "../src/assets/fonts/LeagueSpartan-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../src/assets/fonts/LeagueSpartan-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-league",
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}