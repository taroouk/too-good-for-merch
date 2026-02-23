import "./globals.css";
import { inter, league } from "../src/lib/fonts";
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${league.variable}`}>
      <body>{children}</body>
    </html>
  );
}