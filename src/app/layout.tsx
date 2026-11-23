import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, DM_Sans, IBM_Plex_Mono, IBM_Plex_Sans, Inter, Source_Serif_4 } from "next/font/google";
import { ThemeSync } from "@/components/theme-sync";
import { ShopProvider } from "@/lib/shop-context";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// The default typeface. The others below are fetched only when someone picks them.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  preload: false,
});

// Also the wordmark: "Dan" is set in this in every typeface.
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
  preload: false,
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
    <html lang="en" className={`${plexSans.variable} ${inter.variable} ${dmSans.variable} ${bodoni.variable} ${sourceSerif.variable} ${plex.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Paints a saved theme before first paint. See THEME_BOOT_SCRIPT for what it will accept. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeSync />
        <div className="no-print h-1.5 bg-seal" aria-hidden />
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:bg-paper focus:px-3 focus:py-2">
          Skip to the counter
        </a>
        <ShopProvider>{children}</ShopProvider>
      </body>
    </html>
  );
}
