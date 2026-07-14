import type { Metadata } from "next";
import { DM_Sans, Geist, Geist_Mono, Montserrat, Nunito, Poppins } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// The unimoni brand/creative font — rounded sans used across their promo
// artwork ("Exchange wide range of currencies…"). Self-hosted at build time
// (next/font), so it also works on offline TVs.
const nunito = Nunito({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

// Bold geometric sans matching the unimoni creative headline style
// ("CHOOSE US FOR MONEY EXCHANGE"). Self-hosted for offline TVs.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: `${BRAND.displayName} | ${BRAND.pageTitle}`,
  description:
    "unimoni money exchange platform — branch administration, browser-based digital signage, and real-time exchange rate synchronization.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} ${nunito.variable} ${montserrat.variable} ${poppins.variable} h-full`}>
      <body className="min-h-full bg-background text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
