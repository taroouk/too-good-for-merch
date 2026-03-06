import "./globals.css";
import localFont from "next/font/local";
import { Inter } from "next/font/google";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en"   className={`${league.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}