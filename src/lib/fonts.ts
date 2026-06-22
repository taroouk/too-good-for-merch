import localFont from "next/font/local";

// The application intentionally uses the system sans-serif stack for body copy.
// Keeping this local alias avoids a build-time dependency on Google Fonts.
export const inter = localFont({
  src: "../assets/fonts/LeagueSpartan-SemiBold.ttf",
  weight: "600",
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
