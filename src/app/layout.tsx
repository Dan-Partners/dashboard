import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { ShopProvider } from "@/lib/shop-context";
import "./globals.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-bodoni",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-source",
  display: "swap",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dan",
    template: "%s · Dan",
  },
  description: "Dan is the counter for a Chinese takeaway: orders, the kitchen, and the bill, connected to the shop server.",
  applicationName: "Dan",
};

export const viewport: Viewport = {
  themeColor: "#F5EEDC",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodoni.variable} ${sourceSerif.variable} ${plex.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <div className="no-print h-1.5 bg-vermilion" aria-hidden />
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:bg-paper focus:px-3 focus:py-2">
          Skip to the counter
        </a>
        <ShopProvider>{children}</ShopProvider>
      </body>
    </html>
  );
}
