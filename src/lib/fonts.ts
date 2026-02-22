import localFont from "next/font/local";
import { Inter } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const league = localFont({
  src: [
    {
      path: "../assets/fonts/LeagueSpartan-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../assets/fonts/LeagueSpartan-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-league",
  display: "swap",
});